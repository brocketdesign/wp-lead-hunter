import { v4 as uuidv4 } from 'uuid';
import { Lead as LeadType, LeadStatus, QualificationCriteria } from '../types';
import { Lead, ILead } from '../models';
import logger from '../utils/logger';
import wordpressDetector from './wordpressDetector.service';
import domainAgeService from './domainAge.service';
import trafficEstimator from './trafficEstimator.service';
import notionService from './notion.service';
import searchService from './search.service';
import openaiService, { BlogClassification } from './openai.service';

interface DiscoveryOptions {
  keywords: string[];
  minDomainAge?: number;
  minTraffic?: number;
  maxResults?: number;
  expandKeywords?: boolean;
  openaiApiKey?: string;
  userId?: string;
  filterCorporate?: boolean;
  requireActiveBlog?: boolean;
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
  blogClassification?: BlogClassification;
  isActiveBlog?: boolean;
  lastPostDate?: Date;
  postFrequency?: string;
  isGoodTarget?: boolean;
}

interface DiscoveryResult {
  leads: DiscoveredLead[];
  suggestedKeywords: string[];
  totalFound: number;
  filteredOut: number;
  discoverySessionId: string;
}

export class LeadService {
  private discoveryCache: Map<string, DiscoveredLead[]> = new Map();

  /**
   * Discover leads by searching for WordPress blogs using keywords
   * Now with OpenAI-powered blog classification and filtering
   */
  async discoverByKeywords(options: DiscoveryOptions): Promise<DiscoveryResult> {
    const {
      keywords,
      minDomainAge = 0,
      minTraffic = 0,
      maxResults = 20,
      expandKeywords = true,
      openaiApiKey,
      filterCorporate = true,
      requireActiveBlog = false,
    } = options;

    const discoverySessionId = uuidv4();
    let filteredOutCount = 0;

    logger.info('Starting keyword-based lead discovery', { 
      keywords, 
      maxResults, 
      discoverySessionId,
      filterCorporate,
      requireActiveBlog 
    });

    // Update OpenAI service with user's API key if provided
    if (openaiApiKey) {
      openaiService.updateApiKey(openaiApiKey);
    }

    // Generate suggested keywords using OpenAI
    let suggestedKeywords: string[] = [];
    if (expandKeywords && keywords.length > 0) {
      try {
        suggestedKeywords = await openaiService.suggestKeywords(keywords[0], 10);
        logger.info('Generated keyword suggestions', { count: suggestedKeywords.length });
      } catch (error) {
        logger.warn('Failed to generate keyword suggestions');
      }
    }

    // Search for blogs using the keywords
    const searchResults = await searchService.searchWordPressBlogs(keywords, maxResults * 3);
    logger.info(`Search returned ${searchResults.length} results`);

    const discoveredLeads: DiscoveredLead[] = [];
    const processedUrls = new Set<string>();

    // First pass: collect basic info for all results
    const candidateLeads: Array<{
      url: string;
      title: string;
      description?: string;
      domain: string;
      isWordPress: boolean;
      domainAge?: number;
      traffic?: number;
      email?: string;
    }> = [];

    // Process each search result
    for (const result of searchResults) {
      if (candidateLeads.length >= maxResults * 2) break;
      if (processedUrls.has(result.url)) continue;
      
      processedUrls.add(result.url);

      try {
        // Check if it's a WordPress site
        const isWordPress = await wordpressDetector.isWordPressSite(result.url);
        
        if (!isWordPress) {
          logger.debug(`${result.url} is not WordPress, skipping`);
          continue;
        }

        // Extract metadata
        const metadata = await wordpressDetector.extractMetadata(result.url);
        
        // Get domain info
        const domain = this.extractDomain(result.url);
        const domainAge = await domainAgeService.getDomainAgeInMonths(domain);
        const traffic = await trafficEstimator.estimateTraffic(domain);

        // Apply filters
        if (minDomainAge && (!domainAge || domainAge < minDomainAge)) {
          logger.debug(`${result.url} domain too young (${domainAge} months), skipping`);
          continue;
        }

        if (minTraffic && (!traffic || traffic < minTraffic)) {
          logger.debug(`${result.url} traffic too low (${traffic}), skipping`);
          continue;
        }

        candidateLeads.push({
          url: result.url,
          title: metadata.title || result.title || domain,
          description: metadata.description || result.description,
          domain,
          isWordPress: true,
          domainAge: domainAge || undefined,
          traffic: traffic || undefined,
          email: metadata.email,
        });

        logger.debug(`Found WordPress candidate: ${result.url}`);
      } catch (error) {
        logger.warn(`Error processing ${result.url}:`, { error });
      }
    }

    logger.info(`Found ${candidateLeads.length} WordPress candidates for classification`);

    // Second pass: classify blogs using OpenAI to filter corporate sites
    if (filterCorporate && candidateLeads.length > 0) {
      const blogsToClassify = candidateLeads.map(lead => ({
        url: lead.url,
        title: lead.title,
        description: lead.description,
        domain: lead.domain,
      }));

      const classifications = await openaiService.classifyBlogsParallel(blogsToClassify);

      for (const lead of candidateLeads) {
        if (discoveredLeads.length >= maxResults) break;

        const classification = classifications.get(lead.url);
        
        // Filter out corporate sites if enabled
        if (classification && classification.isCorporateSite) {
          logger.debug(`${lead.url} classified as corporate site, filtering out`, {
            blogType: classification.blogType,
            reasoning: classification.reasoning,
          });
          filteredOutCount++;
          continue;
        }

        // Check if it's a good collaboration target
        const isGoodTarget = classification?.isGoodCollaborationTarget ?? true;

        // Calculate score with new factors
        const score = this.calculateDiscoveryScore({
          isWordPress: lead.isWordPress,
          hasEmail: !!lead.email,
          domainAge: lead.domainAge,
          traffic: lead.traffic,
          isPersonalBlog: classification?.isPersonalBlog,
          confidence: classification?.confidence,
          isGoodTarget,
        });

        discoveredLeads.push({
          url: lead.url,
          title: lead.title,
          description: lead.description,
          email: lead.email,
          isWordPress: lead.isWordPress,
          domainAge: lead.domainAge,
          traffic: lead.traffic,
          score,
          blogType: classification?.blogType || 'unknown',
          blogClassification: classification,
          isGoodTarget,
        });
      }
    } else {
      // No classification - just add candidates directly
      for (const lead of candidateLeads) {
        if (discoveredLeads.length >= maxResults) break;

        const score = this.calculateDiscoveryScore({
          isWordPress: lead.isWordPress,
          hasEmail: !!lead.email,
          domainAge: lead.domainAge,
          traffic: lead.traffic,
        });

        discoveredLeads.push({
          url: lead.url,
          title: lead.title,
          description: lead.description,
          email: lead.email,
          isWordPress: lead.isWordPress,
          domainAge: lead.domainAge,
          traffic: lead.traffic,
          score,
          blogType: 'unknown',
        });
      }
    }

    // Cache results for this session
    this.discoveryCache.set(discoverySessionId, discoveredLeads);

    // Sort by score descending
    discoveredLeads.sort((a, b) => b.score - a.score);

    logger.info('Lead discovery completed', {
      found: discoveredLeads.length,
      filteredOut: filteredOutCount,
      suggestedKeywords: suggestedKeywords.length,
      discoverySessionId,
    });

    return {
      leads: discoveredLeads,
      suggestedKeywords,
      totalFound: discoveredLeads.length,
      filteredOut: filteredOutCount,
      discoverySessionId,
    };
  }

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

    if (factors.isWordPress) score += 15;
    if (factors.hasEmail) score += 15;

    if (factors.domainAge) {
      if (factors.domainAge >= 24) score += 20;
      else if (factors.domainAge >= 12) score += 12;
      else if (factors.domainAge >= 6) score += 8;
    }

    if (factors.traffic) {
      if (factors.traffic >= 10000) score += 25;
      else if (factors.traffic >= 5000) score += 18;
      else if (factors.traffic >= 1000) score += 10;
      else if (factors.traffic >= 500) score += 5;
    }

    // Bonus for personal/indie blogs (good collaboration targets)
    if (factors.isPersonalBlog) score += 15;
    if (factors.isGoodTarget) score += 10;

    // Confidence bonus
    if (factors.confidence && factors.confidence > 70) {
      score += Math.floor(factors.confidence / 20);
    }

    return Math.min(score, 100);
  }

  /**
   * Save discovered leads to the database for a user
   */
  async saveDiscoveredLeads(
    userId: string,
    leads: DiscoveredLead[],
    source: string,
    discoverySessionId?: string
  ): Promise<ILead[]> {
    const savedLeads: ILead[] = [];
    const sessionId = discoverySessionId || uuidv4();

    for (const lead of leads) {
      try {
        const domain = this.extractDomain(lead.url);

        // Try to find existing lead by domain for this user
        let existingLead = await Lead.findOne({ clerkUserId: userId, domain });

        if (existingLead) {
          // Update existing lead with new data
          existingLead.title = lead.title || existingLead.title;
          existingLead.description = lead.description || existingLead.description;
          existingLead.email = lead.email || existingLead.email;
          existingLead.traffic = lead.traffic || existingLead.traffic;
          existingLead.domainAge = lead.domainAge || existingLead.domainAge;
          existingLead.qualificationScore = lead.score;
          existingLead.blogType = lead.blogType || existingLead.blogType;
          existingLead.blogClassification = lead.blogClassification || existingLead.blogClassification;
          existingLead.isActiveBlog = lead.isActiveBlog || existingLead.isActiveBlog;
          await existingLead.save();
          savedLeads.push(existingLead);
          logger.debug(`Updated existing lead: ${domain}`);
        } else {
          // Create new lead
          const newLead = new Lead({
            clerkUserId: userId,
            url: lead.url,
            domain,
            title: lead.title,
            description: lead.description,
            email: lead.email,
            isWordPress: lead.isWordPress,
            blogType: lead.blogType || 'unknown',
            blogClassification: lead.blogClassification,
            isActiveBlog: lead.isActiveBlog || false,
            lastPostDate: lead.lastPostDate,
            postFrequency: lead.postFrequency,
            traffic: lead.traffic,
            domainAge: lead.domainAge,
            isQualified: lead.score >= 50,
            qualificationScore: lead.score,
            status: lead.score >= 50 ? 'QUALIFIED' : 'DISCOVERED',
            tags: [],
            source,
            discoverySessionId: sessionId,
          });

          await newLead.save();
          savedLeads.push(newLead);
          logger.debug(`Saved new lead: ${domain}`);
        }
      } catch (error: any) {
        if (error.code === 11000) {
          logger.debug(`Lead already exists for domain: ${lead.url}`);
        } else {
          logger.error(`Error saving lead ${lead.url}:`, { error: error.message });
        }
      }
    }

    logger.info(`Saved ${savedLeads.length} leads to database`, { userId, sessionId });
    return savedLeads;
  }

  /**
   * Get all leads for a user from the database
   */
  async getLeadsForUser(
    userId: string,
    filters?: {
      status?: string;
      isQualified?: boolean;
      minScore?: number;
      blogType?: string;
      isActiveBlog?: boolean;
      discoverySessionId?: string;
    }
  ): Promise<ILead[]> {
    const query: any = { clerkUserId: userId };

    if (filters?.status) query.status = filters.status;
    if (filters?.isQualified !== undefined) query.isQualified = filters.isQualified;
    if (filters?.minScore !== undefined) query.qualificationScore = { $gte: filters.minScore };
    if (filters?.blogType) query.blogType = filters.blogType;
    if (filters?.isActiveBlog !== undefined) query.isActiveBlog = filters.isActiveBlog;
    if (filters?.discoverySessionId) query.discoverySessionId = filters.discoverySessionId;

    return Lead.find(query).sort({ qualificationScore: -1, createdAt: -1 });
  }

  /**
   * Get a single lead by ID for a user
   */
  async getLeadById(userId: string, leadId: string): Promise<ILead | null> {
    return Lead.findOne({ _id: leadId, clerkUserId: userId });
  }

  /**
   * Update a lead for a user
   */
  async updateLeadForUser(userId: string, leadId: string, updates: Partial<ILead>): Promise<ILead | null> {
    const lead = await Lead.findOneAndUpdate(
      { _id: leadId, clerkUserId: userId },
      { $set: updates },
      { new: true }
    );

    if (lead && lead.isQualified) {
      try {
        const notionPageId = await notionService.syncLead(this.convertToLeadType(lead));
        if (notionPageId && !lead.notionPageId) {
          lead.notionPageId = notionPageId;
          lead.lastSyncedAt = new Date();
          await lead.save();
        }
      } catch (error) {
        logger.warn('Failed to sync lead to Notion:', { error });
      }
    }

    return lead;
  }

  /**
   * Delete a lead for a user
   */
  async deleteLeadForUser(userId: string, leadId: string): Promise<boolean> {
    const result = await Lead.deleteOne({ _id: leadId, clerkUserId: userId });
    return result.deletedCount > 0;
  }

  /**
   * Get discovery sessions for a user
   */
  async getDiscoverySessions(userId: string): Promise<Array<{
    sessionId: string;
    source: string;
    leadCount: number;
    createdAt: Date;
  }>> {
    const sessions = await Lead.aggregate([
      { $match: { clerkUserId: userId, discoverySessionId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$discoverySessionId',
          source: { $first: '$source' },
          leadCount: { $sum: 1 },
          createdAt: { $min: '$createdAt' },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return sessions.map(s => ({
      sessionId: s._id,
      source: s.source,
      leadCount: s.leadCount,
      createdAt: s.createdAt,
    }));
  }

  /**
   * Get stats for a user's leads
   */
  async getLeadStats(userId: string): Promise<{
    total: number;
    qualified: number;
    contacted: number;
    converted: number;
    byBlogType: Record<string, number>;
    avgScore: number;
  }> {
    const leads = await Lead.find({ clerkUserId: userId });
    
    const byBlogType: Record<string, number> = {};
    let totalScore = 0;

    for (const lead of leads) {
      const type = lead.blogType || 'unknown';
      byBlogType[type] = (byBlogType[type] || 0) + 1;
      totalScore += lead.qualificationScore || 0;
    }

    return {
      total: leads.length,
      qualified: leads.filter(l => l.isQualified).length,
      contacted: leads.filter(l => l.status === 'CONTACTED').length,
      converted: leads.filter(l => l.status === 'CONVERTED').length,
      byBlogType,
      avgScore: leads.length > 0 ? Math.round(totalScore / leads.length) : 0,
    };
  }

  // Helper to convert ILead to LeadType for Notion sync
  private convertToLeadType(lead: ILead): LeadType {
    return {
      id: lead._id.toString(),
      url: lead.url,
      domain: lead.domain,
      title: lead.title,
      description: lead.description,
      email: lead.email,
      contactName: lead.contactName,
      traffic: lead.traffic,
      domainAge: lead.domainAge,
      isWordPress: lead.isWordPress,
      isQualified: lead.isQualified,
      qualificationScore: lead.qualificationScore,
      status: lead.status as LeadStatus,
      outreachAttempts: lead.outreachAttempts,
      lastOutreachDate: lead.lastOutreachDate,
      emailsSent: [],
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      tags: lead.tags,
      notes: lead.notes,
      notionPageId: lead.notionPageId,
      lastSyncedAt: lead.lastSyncedAt,
    };
  }

  private oldCalculateDiscoveryScore(factors: {
    isWordPress: boolean;
    hasEmail: boolean;
    domainAge?: number | null;
    traffic?: number | null;
  }): number {
    let score = 0;

    if (factors.isWordPress) score += 20;
    if (factors.hasEmail) score += 15;

    if (factors.domainAge) {
      if (factors.domainAge >= 24) score += 25;
      else if (factors.domainAge >= 12) score += 15;
      else if (factors.domainAge >= 6) score += 10;
    }

    if (factors.traffic) {
      if (factors.traffic >= 10000) score += 30;
      else if (factors.traffic >= 5000) score += 20;
      else if (factors.traffic >= 1000) score += 10;
    }

    return Math.min(score, 100);
  }

  async discoverAndQualifyLead(url: string, criteria: QualificationCriteria): Promise<LeadType> {
    logger.info(`Discovering lead: ${url}`);

    const domain = this.extractDomain(url);
    const leadId = uuidv4();

    // Create initial lead
    const lead: LeadType = {
      id: leadId,
      url,
      domain,
      isWordPress: false,
      isQualified: false,
      status: LeadStatus.DISCOVERED,
      outreachAttempts: 0,
      emailsSent: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
    };

    // Detect WordPress
    lead.isWordPress = await wordpressDetector.isWordPressSite(url);
    if (!lead.isWordPress) {
      logger.info(`${url} is not a WordPress site`);
      return lead;
    }

    // Extract metadata
    const metadata = await wordpressDetector.extractMetadata(url);
    lead.title = metadata.title;
    lead.description = metadata.description;
    lead.email = metadata.email;

    // Get domain age
    lead.domainAge = (await domainAgeService.getDomainAgeInMonths(domain)) || undefined;

    // Estimate traffic
    lead.traffic = (await trafficEstimator.estimateTraffic(domain)) || undefined;

    // Qualify lead
    lead.isQualified = this.qualifyLead(lead, criteria);
    lead.qualificationScore = this.calculateQualificationScore(lead, criteria);

    if (lead.isQualified) {
      lead.status = LeadStatus.QUALIFIED;
      lead.tags.push('qualified');
    }

    lead.updatedAt = new Date();

    logger.info(`Lead ${leadId} discovered and qualified:`, {
      domain: lead.domain,
      isQualified: lead.isQualified,
      score: lead.qualificationScore,
    });

    return lead;
  }

  private qualifyLead(lead: LeadType, criteria: QualificationCriteria): boolean {
    // Check basic criteria
    if (criteria.minDomainAge && (!lead.domainAge || lead.domainAge < criteria.minDomainAge)) {
      return false;
    }

    if (criteria.minTraffic && (!lead.traffic || lead.traffic < criteria.minTraffic)) {
      return false;
    }

    if (criteria.requireEmail && !lead.email) {
      return false;
    }

    // Check custom rules if any
    if (criteria.customRules) {
      for (const rule of criteria.customRules) {
        if (!this.evaluateRule(lead, rule)) {
          return false;
        }
      }
    }

    return true;
  }

  private evaluateRule(lead: LeadType, rule: any): boolean {
    // Simplified rule evaluation
    const fieldValue = (lead as any)[rule.field];

    switch (rule.operator) {
      case 'gt':
        return fieldValue > rule.value;
      case 'lt':
        return fieldValue < rule.value;
      case 'eq':
        return fieldValue === rule.value;
      case 'contains':
        return String(fieldValue).includes(rule.value);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      default:
        return true;
    }
  }

  private calculateQualificationScore(lead: LeadType, criteria: QualificationCriteria): number {
    let score = 0;

    // Base scores
    if (lead.isWordPress) score += 20;
    if (lead.email) score += 15;

    // Domain age scoring
    if (lead.domainAge) {
      if (lead.domainAge >= 24) score += 25;
      else if (lead.domainAge >= 12) score += 15;
      else if (lead.domainAge >= 6) score += 10;
    }

    // Traffic scoring
    if (lead.traffic) {
      if (lead.traffic >= 10000) score += 30;
      else if (lead.traffic >= 5000) score += 20;
      else if (lead.traffic >= 1000) score += 10;
    }

    // Custom rules scoring
    if (criteria.customRules) {
      for (const rule of criteria.customRules) {
        if (this.evaluateRule(lead, rule)) {
          score += rule.weight || 5;
        }
      }
    }

    return Math.min(score, 100);
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  // Database-backed methods for backward compatibility
  async getLead(id: string): Promise<LeadType | null> {
    const lead = await Lead.findById(id);
    return lead ? this.convertToLeadType(lead) : null;
  }

  async getAllLeads(filters?: {
    status?: LeadStatus;
    isQualified?: boolean;
    minScore?: number;
  }): Promise<LeadType[]> {
    const query: any = {};

    if (filters?.status) query.status = filters.status;
    if (filters?.isQualified !== undefined) query.isQualified = filters.isQualified;
    if (filters?.minScore !== undefined) query.qualificationScore = { $gte: filters.minScore };

    const leads = await Lead.find(query).sort({ qualificationScore: -1, createdAt: -1 });
    return leads.map(l => this.convertToLeadType(l));
  }

  async updateLead(id: string, updates: Partial<LeadType>): Promise<LeadType | null> {
    const lead = await Lead.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!lead) return null;

    // Sync to Notion
    if (lead.isQualified) {
      try {
        const notionPageId = await notionService.syncLead(this.convertToLeadType(lead));
        if (notionPageId && !lead.notionPageId) {
          lead.notionPageId = notionPageId;
          lead.lastSyncedAt = new Date();
          await lead.save();
        }
      } catch (error) {
        logger.warn('Failed to sync lead to Notion:', { error });
      }
    }

    return this.convertToLeadType(lead);
  }

  async deleteLead(id: string): Promise<boolean> {
    const result = await Lead.findByIdAndDelete(id);
    return !!result;
  }

  async syncAllToNotion(userId?: string): Promise<void> {
    const query: any = { isQualified: true };
    if (userId) query.clerkUserId = userId;

    const qualifiedLeads = await Lead.find(query);
    await notionService.batchSyncLeads(qualifiedLeads.map(l => this.convertToLeadType(l)));
  }
}

export default new LeadService();
