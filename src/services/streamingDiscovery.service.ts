import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';
import { DiscoverySession } from '../models';
import logger from '../utils/logger';
import wordpressDetector from './wordpressDetector.service';
import trafficEstimator from './trafficEstimator.service';
import searchService, { SearchResult } from './search.service';
import openaiService from './openai.service';
import config from '../config';

interface DiscoveryLogEntry {
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'error' | 'progress';
  message: string;
  details?: Record<string, unknown>;
}

interface DiscoveredLead {
  url: string;
  title?: string;
  description?: string;
  email?: string;
  isWordPress: boolean;
  domainAge?: number;
  traffic?: number;
  score: number;
  blogType?: 'personal' | 'indie' | 'corporate' | 'unknown';
  niche?: string;
  wpConfidenceScore?: number;
  collaborationReason?: string;
  estimatedAudience?: string;
  isActiveBlog?: boolean;
  lastPostDate?: Date;
  postFrequency?: string;
  isGoodTarget?: boolean;
  isSaved?: boolean;
  matchedKeyword?: string;
}

interface EnhancedDiscoveryOptions {
  keywords: string[];
  minTraffic?: number;
  maxResults?: number;
  expandKeywords?: boolean;
  autoSearchExpanded?: boolean;
  maxPagesPerSearch?: number;
  openaiApiKey?: string;
  userId?: string;
  filterCorporate?: boolean;
  requireActiveBlog?: boolean;
  language?: string;
  excludeWordPressCom?: boolean;
  chunkSize?: number;
}

type LogType = 'info' | 'success' | 'warning' | 'error' | 'progress';

export class StreamingDiscoveryService {
  /**
   * Send a Server-Sent Event to the client
   */
  private sendSSE(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Send a log message to the client
   */
  private sendLog(res: Response, type: LogType, message: string, details?: Record<string, unknown>): void {
    const logEntry: DiscoveryLogEntry = {
      timestamp: Date.now(),
      type,
      message,
      details,
    };
    this.sendSSE(res, 'log', logEntry);
    
    if (type === 'error') {
      logger.error(`[Discovery] ${message}`, details);
    } else if (type === 'warning') {
      logger.warn(`[Discovery] ${message}`, details);
    } else {
      logger.info(`[Discovery] ${message}`, details);
    }
  }

  /**
   * Send discovered leads chunk to the client
   */
  private sendLeadsChunk(
    res: Response,
    leads: DiscoveredLead[],
    totalSoFar: number,
    searchedKeywords: string[]
  ): void {
    this.sendSSE(res, 'leads', {
      leads,
      totalSoFar,
      searchedKeywords,
    });
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /**
   * Calculate discovery score for a lead
   */
  private calculateDiscoveryScore(factors: {
    isWordPress: boolean;
    hasEmail: boolean;
    domainAge?: number | null;
    traffic?: number | null;
    isPersonalBlog?: boolean;
    confidence?: number;
    isGoodTarget?: boolean;
  }): number {
    let score = 0;

    if (factors.isWordPress) score += 20;
    if (factors.hasEmail) score += 20;

    if (factors.traffic) {
      if (factors.traffic >= 10000) score += 25;
      else if (factors.traffic >= 5000) score += 18;
      else if (factors.traffic >= 1000) score += 12;
      else if (factors.traffic >= 500) score += 8;
      else score += 3;
    }

    if (factors.isPersonalBlog) score += 20;
    if (factors.isGoodTarget) score += 15;

    if (factors.confidence && factors.confidence > 50) {
      score += Math.floor(factors.confidence / 10);
    }

    return Math.min(score, 100);
  }

  /**
   * Stream discovery results with live updates
   */
  async discoverWithStreaming(
    res: Response,
    options: EnhancedDiscoveryOptions
  ): Promise<void> {
    const {
      keywords,
      minTraffic = 0,
      maxResults = 50,
      expandKeywords = true,
      autoSearchExpanded = true,
      maxPagesPerSearch = 2,
      openaiApiKey,
      userId,
      filterCorporate = true,
      language,
      excludeWordPressCom = true,
      chunkSize = 10,
    } = options;

    const discoverySessionId = uuidv4();
    let filteredOutCount = 0;
    const searchedKeywords: string[] = [];
    const allDiscoveredLeads: DiscoveredLead[] = [];
    const processedUrls = new Set<string>();

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      // Validate API key before starting
      const effectiveApiKey = openaiApiKey || config.openai.apiKey;
      if (!effectiveApiKey || effectiveApiKey.includes('your_') || effectiveApiKey.length < 20) {
        this.sendSSE(res, 'error', {
          error: 'OpenAI API key not configured',
          message: 'Please set your OpenAI API key in Settings before running discovery.',
          code: 'MISSING_API_KEY',
        });
        this.sendLog(res, 'error', 'OpenAI API key not configured. Please set your API key in Settings.');
        res.end();
        return;
      }

      this.sendLog(res, 'info', `Starting discovery session ${discoverySessionId}`, {
        keywords,
        maxResults,
        filterCorporate,
        language,
      });

      // Update both OpenAI and Search services with user's API key if provided
      if (openaiApiKey) {
        openaiService.updateApiKey(openaiApiKey);
        searchService.updateApiKey(openaiApiKey);
        this.sendLog(res, 'info', 'Using custom OpenAI API key');
      } else if (config.openai.apiKey) {
        // Ensure search service has the default API key
        searchService.updateApiKey(config.openai.apiKey);
      }

      // Generate suggested keywords using OpenAI
      let suggestedKeywords: string[] = [];
      let expandedKeywords: string[] = [...keywords];
      
      if (expandKeywords && keywords.length > 0) {
        this.sendLog(res, 'progress', 'Generating keyword suggestions with AI...');
        try {
          suggestedKeywords = await openaiService.suggestKeywords(keywords[0], 10);
          this.sendLog(res, 'success', `Generated ${suggestedKeywords.length} keyword suggestions`, {
            suggestions: suggestedKeywords,
          });
          
          // Send keywords to client
          this.sendSSE(res, 'keywords', {
            suggestedKeywords,
            expandedKeywords: autoSearchExpanded ? [...keywords, ...suggestedKeywords.slice(0, 5)] : keywords,
          });

          // Auto-expand search with suggested keywords
          if (autoSearchExpanded && suggestedKeywords.length > 0) {
            expandedKeywords = [...keywords, ...suggestedKeywords.slice(0, 5)];
            this.sendLog(res, 'info', `Expanding search with ${expandedKeywords.length} keywords`, {
              keywords: expandedKeywords,
            });
          }
        } catch (error) {
          this.sendLog(res, 'warning', 'Failed to generate keyword suggestions, using original keywords only');
        }
      }

      // Search for each keyword
      for (const keyword of expandedKeywords) {
        if (allDiscoveredLeads.length >= maxResults) {
          this.sendLog(res, 'info', `Reached max results (${maxResults}), stopping search`);
          break;
        }

        searchedKeywords.push(keyword);
        this.sendLog(res, 'progress', `Searching for: "${keyword}"`, {
          currentKeyword: keyword,
          keywordIndex: searchedKeywords.length,
          totalKeywords: expandedKeywords.length,
        });

        try {
          // Search with pagination for more comprehensive results
          // Pass progress callback to get real-time search updates
          const searchResults = await searchService.searchWordPressBlogs({
            keywords: [keyword],
            maxResults: maxPagesPerSearch * 10,
            language,
            excludeWordPressCom,
            maxPagesPerSearch,
            onProgress: (message, details) => {
              // Forward search progress to frontend
              this.sendLog(res, 'progress', `[Search] ${message}`, details);
            },
          });

          this.sendLog(res, 'success', `Found ${searchResults.length} search results for "${keyword}"`);

          // Filter unique results
          const uniqueResults = searchResults.filter(r => {
            if (processedUrls.has(r.url)) return false;
            processedUrls.add(r.url);
            return true;
          });

          this.sendLog(res, 'info', `${uniqueResults.length} unique sites to analyze`);

          // Process in batches for efficiency
          const batchSize = 5;
          let batchLeads: DiscoveredLead[] = [];

          for (let i = 0; i < uniqueResults.length; i += batchSize) {
            if (allDiscoveredLeads.length >= maxResults) break;

            const batch = uniqueResults.slice(i, i + batchSize);
            this.sendLog(res, 'progress', `Analyzing sites ${i + 1}-${Math.min(i + batchSize, uniqueResults.length)}...`);

            const batchPromises = batch.map(async (result: SearchResult) => {
              try {
                // Use classification from search results if available (from OpenAI web search)
                const isWordPressFromSearch = result.isWordPress ?? false;
                const wpConfidence = result.wpConfidenceScore ?? 0;
                
                // Verify WordPress if not already confirmed by search
                let isWordPress = isWordPressFromSearch && wpConfidence >= 70;
                if (!isWordPress) {
                  isWordPress = await wordpressDetector.isWordPressSite(result.url);
                }

                if (!isWordPress) {
                  return null;
                }

                // Filter corporate sites based on search classification
                if (filterCorporate && result.blogType === 'corporate') {
                  filteredOutCount++;
                  this.sendLog(res, 'info', `Filtered corporate site: ${result.domain || this.extractDomain(result.url)}`);
                  return null;
                }

                // Extract additional metadata
                const metadata = await wordpressDetector.extractMetadata(result.url);
                const domain = result.domain || this.extractDomain(result.url);
                const traffic = await trafficEstimator.estimateTraffic(domain);

                if (minTraffic && (!traffic || traffic < minTraffic)) {
                  return null;
                }

                // Use classification from search results
                const isPersonalBlog = result.blogType === 'personal' || result.blogType === 'indie';
                const isGoodTarget = result.isGoodCollaborationTarget ?? true;

                const score = this.calculateDiscoveryScore({
                  isWordPress: true,
                  hasEmail: !!(metadata.email || result.url),
                  traffic: traffic || undefined,
                  isPersonalBlog,
                  confidence: wpConfidence,
                  isGoodTarget,
                });

                return {
                  url: result.url,
                  title: metadata.title || result.title || domain,
                  description: metadata.description || result.description,
                  domain,
                  isWordPress: true,
                  traffic: traffic || undefined,
                  email: metadata.email,
                  matchedKeyword: keyword,
                  score,
                  blogType: result.blogType || 'unknown',
                  niche: result.niche,
                  wpConfidenceScore: wpConfidence,
                  isGoodTarget,
                  collaborationReason: result.collaborationReason,
                  estimatedAudience: result.estimatedAudience,
                } as DiscoveredLead;
              } catch {
                return null;
              }
            });

            const batchResults = await Promise.all(batchPromises);
            const validLeads = batchResults.filter((lead): lead is DiscoveredLead => lead !== null);

            for (const lead of validLeads) {
              if (allDiscoveredLeads.length >= maxResults) continue;

              batchLeads.push(lead);
              allDiscoveredLeads.push(lead);

              // Send chunk when we have enough leads
              if (batchLeads.length >= chunkSize) {
                this.sendLeadsChunk(res, batchLeads, allDiscoveredLeads.length, searchedKeywords);
                this.sendLog(res, 'success', `Found ${batchLeads.length} new leads (${allDiscoveredLeads.length} total)`);
                batchLeads = [];
              }
            }
          }

          // Send remaining leads in batch
          if (batchLeads.length > 0) {
            this.sendLeadsChunk(res, batchLeads, allDiscoveredLeads.length, searchedKeywords);
            this.sendLog(res, 'success', `Found ${batchLeads.length} new leads (${allDiscoveredLeads.length} total)`);
          }

        } catch (error) {
          this.sendLog(res, 'error', `Error searching for "${keyword}"`, {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Sort all leads by score
      allDiscoveredLeads.sort((a, b) => b.score - a.score);

      // Save discovery session to database if user is authenticated
      if (userId) {
        try {
          await DiscoverySession.create({
            clerkUserId: userId,
            sessionId: discoverySessionId,
            source: keywords.join(', '),
            leads: allDiscoveredLeads.map(lead => ({
              ...lead,
              isSaved: false,
            })),
            suggestedKeywords,
            totalFound: allDiscoveredLeads.length,
            filteredOut: filteredOutCount,
          });
          this.sendLog(res, 'success', 'Discovery session saved to database');
        } catch (error) {
          this.sendLog(res, 'warning', 'Failed to save discovery session to database');
        }
      }

      // Send completion event
      this.sendSSE(res, 'complete', {
        totalFound: allDiscoveredLeads.length,
        filteredOut: filteredOutCount,
        searchedKeywords,
        suggestedKeywords,
        discoverySessionId,
      });

      this.sendLog(res, 'success', `Discovery complete! Found ${allDiscoveredLeads.length} leads`, {
        filteredOut: filteredOutCount,
        searchedKeywords,
      });

    } catch (error) {
      this.sendSSE(res, 'error', {
        error: error instanceof Error ? error.message : 'Discovery failed',
        details: error instanceof Error ? error.stack : undefined,
      });
      this.sendLog(res, 'error', 'Discovery failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      res.end();
    }
  }
}

export default new StreamingDiscoveryService();
