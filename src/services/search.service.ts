import OpenAI from 'openai';
import { z } from 'zod';
import config from '../config';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';

// Schema for individual WordPress blog result from web search
const WordPressBlogResultSchema = z.object({
  url: z.string().describe('The full URL of the WordPress blog'),
  domain: z.string().describe('The domain name extracted from the URL'),
  title: z.string().describe('The title of the blog/website'),
  description: z.string().describe('A brief description of the blog content and purpose'),
  isWordPress: z.boolean().describe('True if confirmed to be a WordPress site'),
  wpConfidenceScore: z.number().min(0).max(100).describe('Confidence score 0-100 that this is a WordPress site'),
  blogType: z.enum(['personal', 'indie', 'corporate', 'unknown']).describe('Classification: personal (individual blogger), indie (small team), corporate (big company/news)'),
  niche: z.string().optional().describe('The blog niche/topic (e.g., travel, food, tech, lifestyle)'),
  isGoodCollaborationTarget: z.boolean().describe('True if this blogger would be a good target for outreach'),
  collaborationReason: z.string().describe('Brief reason why this is or is not a good collaboration target'),
  estimatedAudience: z.string().optional().describe('Estimated target audience description'),
});

// Schema for the complete web search analysis response
const WebSearchAnalysisSchema = z.object({
  blogs: z.array(WordPressBlogResultSchema).describe('Array of discovered WordPress blogs'),
  searchSummary: z.string().describe('Brief summary of the search results and quality'),
  totalFound: z.number().describe('Total number of relevant blogs found'),
  recommendedFollowUp: z.array(z.string()).optional().describe('Suggested follow-up search queries to find more blogs'),
});

export type WordPressBlogResult = z.infer<typeof WordPressBlogResultSchema>;
export type WebSearchAnalysis = z.infer<typeof WebSearchAnalysisSchema>;

export interface SearchResult {
  url: string;
  title: string;
  description: string;
  domain?: string;
  matchedKeyword?: string;
  // Extended fields from AI analysis
  isWordPress?: boolean;
  wpConfidenceScore?: number;
  blogType?: 'personal' | 'indie' | 'corporate' | 'unknown';
  niche?: string;
  isGoodCollaborationTarget?: boolean;
  collaborationReason?: string;
  estimatedAudience?: string;
}

export interface SearchOptions {
  keywords: string[];
  maxResults?: number;
  language?: string;
  excludeWordPressCom?: boolean;
  maxPagesPerSearch?: number;
  userLocation?: {
    country?: string;
    city?: string;
    region?: string;
  };
  // Progress callback for streaming updates
  onProgress?: (message: string, details?: Record<string, unknown>) => void;
}

// URL citation from OpenAI web search annotations
interface UrlCitation {
  type: 'url_citation';
  start_index: number;
  end_index: number;
  url: string;
  title: string;
}

// Supported languages/regions for search
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', region: 'US' },
  { code: 'de', name: 'German', region: 'DE' },
  { code: 'fr', name: 'French', region: 'FR' },
  { code: 'es', name: 'Spanish', region: 'ES' },
  { code: 'it', name: 'Italian', region: 'IT' },
  { code: 'pt', name: 'Portuguese', region: 'PT' },
  { code: 'nl', name: 'Dutch', region: 'NL' },
  { code: 'pl', name: 'Polish', region: 'PL' },
  { code: 'ru', name: 'Russian', region: 'RU' },
  { code: 'ja', name: 'Japanese', region: 'JP' },
  { code: 'ko', name: 'Korean', region: 'KR' },
  { code: 'zh', name: 'Chinese', region: 'CN' },
  { code: 'ar', name: 'Arabic', region: 'SA' },
  { code: 'hi', name: 'Hindi', region: 'IN' },
  { code: 'tr', name: 'Turkish', region: 'TR' },
  { code: 'sv', name: 'Swedish', region: 'SE' },
  { code: 'da', name: 'Danish', region: 'DK' },
  { code: 'no', name: 'Norwegian', region: 'NO' },
  { code: 'fi', name: 'Finnish', region: 'FI' },
] as const;

export class SearchService {
  private client: OpenAI | null = null;

  constructor() {
    if (config.openai.apiKey) {
      this.client = new OpenAI({ apiKey: config.openai.apiKey });
      logger.info('OpenAI web search configured');
    } else {
      logger.warn('OpenAI API key not configured. Search will not work.');
    }
  }

  /**
   * Check if a URL is a wordpress.com hosted blog (not self-hosted)
   */
  private isWordPressComHosted(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      return hostname === 'wordpress.com' || hostname.endsWith('.wordpress.com');
    } catch {
      return false;
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /**
   * Build user location config for OpenAI web search
   */
  private buildUserLocation(language?: string, userLocation?: SearchOptions['userLocation']) {
    if (userLocation) {
      return {
        type: 'approximate' as const,
        country: userLocation.country,
        city: userLocation.city,
        region: userLocation.region,
      };
    }

    // Map language to approximate location
    if (language) {
      const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === language);
      if (langConfig) {
        return {
          type: 'approximate' as const,
          country: langConfig.region,
        };
      }
    }

    return undefined;
  }

  /**
   * Search for WordPress blogs using OpenAI web search with structured JSON output
   */
  async searchWordPressBlogs(
    keywordsOrOptions: string[] | SearchOptions,
    maxResultsParam?: number
  ): Promise<SearchResult[]> {
    const options: SearchOptions = Array.isArray(keywordsOrOptions)
      ? { keywords: keywordsOrOptions, maxResults: maxResultsParam }
      : keywordsOrOptions;

    const {
      keywords,
      maxResults = 20,
      language,
      excludeWordPressCom = true,
      userLocation,
      onProgress,
    } = options;

    if (!this.client) {
      logger.error('OpenAI client not configured');
      onProgress?.('Error: OpenAI client not configured');
      return [];
    }

    logger.info('Starting WordPress blog search', { keywords, maxResults, language });
    onProgress?.('Starting web search...', { keywords, maxResults });

    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      try {
        logger.info(`[${i + 1}/${keywords.length}] Searching for keyword: "${keyword}"`);
        onProgress?.(`Searching: "${keyword}" (${i + 1}/${keywords.length})...`, { keyword, index: i });
        
        const startTime = Date.now();
        const searchResults = await this.searchWithWebSearch(
          keyword,
          Math.min(maxResults, 15),
          language,
          userLocation,
          onProgress
        );
        const elapsed = Date.now() - startTime;
        
        logger.info(`Search for "${keyword}" completed in ${elapsed}ms, found ${searchResults.length} results`);
        onProgress?.(`Found ${searchResults.length} blogs for "${keyword}" (${elapsed}ms)`, { 
          keyword, 
          count: searchResults.length, 
          elapsed 
        });

        for (const result of searchResults) {
          if (seenUrls.has(result.url)) continue;

          if (excludeWordPressCom && this.isWordPressComHosted(result.url)) {
            logger.debug(`Skipping wordpress.com hosted blog: ${result.url}`);
            continue;
          }

          seenUrls.add(result.url);
          allResults.push({ ...result, matchedKeyword: keyword });

          if (allResults.length >= maxResults) break;
        }

        if (allResults.length >= maxResults) {
          logger.info(`Reached max results (${maxResults}), stopping search`);
          break;
        }
      } catch (error) {
        logger.error(`Error searching for keyword "${keyword}":`, {
          error: getErrorMessage(error),
        });
        onProgress?.(`Error searching for "${keyword}": ${getErrorMessage(error)}`);
      }
    }

    logger.info(`Search complete: ${allResults.length} total results`);
    onProgress?.(`Search complete: ${allResults.length} total blogs found`);
    return allResults.slice(0, maxResults);
  }

  /**
   * Search using OpenAI web_search tool with structured JSON output
   * This replaces both Google API search and separate AI analysis
   */
  private async searchWithWebSearch(
    keyword: string,
    maxResults: number,
    language?: string,
    userLocation?: SearchOptions['userLocation'],
    onProgress?: SearchOptions['onProgress']
  ): Promise<SearchResult[]> {
    if (!this.client) {
      return [];
    }

    try {
      const searchQuery = `${keyword} wordpress blog personal blogger`;
      logger.info(`Initiating OpenAI web search for: "${searchQuery}"`);
      onProgress?.(`Calling OpenAI web search API...`);

      // Build web search tool configuration
      const webSearchTool: OpenAI.Responses.WebSearchTool = {
        type: 'web_search',
      };

      // Add user location if specified
      const location = this.buildUserLocation(language, userLocation);
      if (location) {
        webSearchTool.user_location = location;
        logger.debug('Using location for search', { location });
      }

      const startTime = Date.now();
      logger.info('Sending request to OpenAI Responses API with web_search tool...');
      onProgress?.('Waiting for OpenAI web search response...');

      // Create the response with web search and structured JSON output
      // Using gpt-4o-mini for faster response (o4-mini is slower due to reasoning)
      const response = await this.client.responses.create({
        model: 'gpt-4o-mini',
        tools: [webSearchTool],
        text: {
          format: {
            type: 'json_schema',
            name: 'wordpress_blog_analysis',
            schema: {
              type: 'object',
              properties: {
                blogs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      url: { type: 'string', description: 'The full URL of the WordPress blog' },
                      domain: { type: 'string', description: 'The domain name' },
                      title: { type: 'string', description: 'The title of the blog' },
                      description: { type: 'string', description: 'Brief description of the blog' },
                      isWordPress: { type: 'boolean', description: 'True if confirmed WordPress' },
                      wpConfidenceScore: { type: 'number', description: 'Confidence 0-100 that this is WordPress' },
                      blogType: {
                        type: 'string',
                        enum: ['personal', 'indie', 'corporate', 'unknown'],
                        description: 'Blog classification type',
                      },
                      niche: { type: 'string', description: 'Blog niche/topic' },
                      isGoodCollaborationTarget: { type: 'boolean', description: 'Good for outreach' },
                      collaborationReason: { type: 'string', description: 'Why good/bad for collaboration' },
                      estimatedAudience: { type: 'string', description: 'Target audience' },
                    },
                    required: [
                      'url',
                      'domain',
                      'title',
                      'description',
                      'isWordPress',
                      'wpConfidenceScore',
                      'blogType',
                      'niche',
                      'isGoodCollaborationTarget',
                      'collaborationReason',
                      'estimatedAudience',
                    ],
                    additionalProperties: false,
                  },
                  description: 'Array of discovered WordPress blogs',
                },
                searchSummary: { type: 'string', description: 'Summary of search results' },
                totalFound: { type: 'number', description: 'Total blogs found' },
                recommendedFollowUp: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Suggested follow-up queries',
                },
              },
              required: ['blogs', 'searchSummary', 'totalFound', 'recommendedFollowUp'],
              additionalProperties: false,
            },
            strict: true,
          },
        },
        input: `Search for WordPress blogs related to: "${searchQuery}"

Find up to ${maxResults} WordPress blogs that are:
1. Personal or indie blogs run by individuals or small teams (NOT corporate sites, news outlets, or large businesses)
2. Actively maintained WordPress sites
3. Good targets for collaboration and outreach opportunities

For each blog found:
- Extract the URL, domain, and title
- Determine if it's actually a WordPress site (look for wp-content, WordPress indicators)
- Classify as personal, indie, or corporate
- Identify the niche/topic
- Assess if it's a good collaboration target

IMPORTANT: Focus on finding REAL personal bloggers who would respond to outreach, NOT:
- Large news sites (CNN, Forbes, etc.)
- Corporate marketing blogs
- E-commerce product pages
- Government or university sites

${language ? `Prefer blogs in ${language} language.` : ''}

Return the analysis in JSON format.`,
      });

      const apiElapsed = Date.now() - startTime;
      logger.info(`OpenAI API response received in ${apiElapsed}ms`);
      onProgress?.(`OpenAI responded in ${(apiElapsed / 1000).toFixed(1)}s, processing results...`);

      // Extract annotations (URL citations) from the response
      const annotations = this.extractAnnotations(response);
      logger.info(`Extracted ${annotations.length} URL citations from response`);
      onProgress?.(`Found ${annotations.length} URL citations`);

      // Parse the structured JSON output
      const outputText = response.output_text;

      if (!outputText) {
        logger.warn('No output text from web search');
        onProgress?.('No structured output, using URL citations only');
        return this.convertAnnotationsToResults(annotations);
      }

      try {
        const analysis = JSON.parse(outputText) as WebSearchAnalysis;
        const validated = WebSearchAnalysisSchema.safeParse(analysis);

        if (validated.success) {
          logger.info(`Web search for "${keyword}" found ${validated.data.totalFound} blogs`, {
            summary: validated.data.searchSummary,
            blogCount: validated.data.blogs.length,
          });
          onProgress?.(`Parsed ${validated.data.blogs.length} blogs from AI analysis`);

          // Merge AI analysis with citation data for enriched results
          return this.mergeResultsWithAnnotations(validated.data.blogs, annotations);
        } else {
          logger.warn('JSON schema validation failed, using annotations only', {
            errors: validated.error.issues,
          });
          onProgress?.('Schema validation failed, using citations only');
          return this.convertAnnotationsToResults(annotations);
        }
      } catch (parseError) {
        logger.warn('Failed to parse JSON output, using annotations only', {
          error: getErrorMessage(parseError),
        });
        onProgress?.('JSON parse error, using citations only');
        return this.convertAnnotationsToResults(annotations);
      }
    } catch (error) {
      logger.error('OpenAI web search error:', { error: getErrorMessage(error) });
      onProgress?.(`Search error: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Extract URL citations from OpenAI response annotations
   */
  private extractAnnotations(response: OpenAI.Responses.Response): UrlCitation[] {
    const annotations: UrlCitation[] = [];

    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.annotations) {
            for (const annotation of content.annotations) {
              if (annotation.type === 'url_citation') {
                annotations.push({
                  type: 'url_citation',
                  start_index: annotation.start_index,
                  end_index: annotation.end_index,
                  url: annotation.url,
                  title: annotation.title,
                });
              }
            }
          }
        }
      }
    }

    return annotations;
  }

  /**
   * Convert annotations to basic search results (fallback)
   */
  private convertAnnotationsToResults(annotations: UrlCitation[]): SearchResult[] {
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const annotation of annotations) {
      if (seenUrls.has(annotation.url)) continue;
      seenUrls.add(annotation.url);

      results.push({
        url: annotation.url,
        title: annotation.title,
        description: '',
        domain: this.extractDomain(annotation.url),
      });
    }

    return results;
  }

  /**
   * Merge AI-analyzed blogs with annotation data for complete results
   */
  private mergeResultsWithAnnotations(
    blogs: WordPressBlogResult[],
    annotations: UrlCitation[]
  ): SearchResult[] {
    const annotationMap = new Map(annotations.map(a => [a.url, a]));

    return blogs.map(blog => {
      const annotation = annotationMap.get(blog.url);

      return {
        url: blog.url,
        title: annotation?.title || blog.title,
        description: blog.description,
        domain: blog.domain,
        isWordPress: blog.isWordPress,
        wpConfidenceScore: blog.wpConfidenceScore,
        blogType: blog.blogType,
        niche: blog.niche,
        isGoodCollaborationTarget: blog.isGoodCollaborationTarget,
        collaborationReason: blog.collaborationReason,
        estimatedAudience: blog.estimatedAudience,
      };
    });
  }

  /**
   * Search for specific types of WordPress content
   */
  async searchWordPressByCategory(
    category: string,
    niche: string,
    maxResults: number = 20
  ): Promise<SearchResult[]> {
    const queries = [
      `${niche} ${category} wordpress blog personal blogger`,
      `best ${niche} wordpress blogs individual`,
      `${niche} bloggers wordpress indie`,
    ];

    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      const results = await this.searchWordPressBlogs([query], Math.ceil(maxResults / queries.length));

      for (const result of results) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }
    }

    return allResults.slice(0, maxResults);
  }

  /**
   * Update the OpenAI client with a new API key
   */
  updateApiKey(apiKey: string): void {
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      logger.info('OpenAI client updated with new API key');
    }
  }
}

export default new SearchService();
