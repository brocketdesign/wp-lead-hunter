import { v4 as uuidv4 } from 'uuid';
import { Lead, LeadStatus, QualificationCriteria } from '../types';
import logger from '../utils/logger';
import wordpressDetector from './wordpressDetector.service';
import domainAgeService from './domainAge.service';
import trafficEstimator from './trafficEstimator.service';
import notionService from './notion.service';

export class LeadService {
  private leads: Map<string, Lead> = new Map();

  async discoverAndQualifyLead(url: string, criteria: QualificationCriteria): Promise<Lead> {
    logger.info(`Discovering lead: ${url}`);

    const domain = this.extractDomain(url);
    const leadId = uuidv4();

    // Create initial lead
    const lead: Lead = {
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
      this.leads.set(leadId, lead);
      return lead;
    }

    // Extract metadata
    const metadata = await wordpressDetector.extractMetadata(url);
    lead.title = metadata.title;
    lead.description = metadata.description;
    lead.email = metadata.email;

    // Get domain age
    lead.domainAge = await domainAgeService.getDomainAgeInMonths(domain) || undefined;

    // Estimate traffic
    lead.traffic = await trafficEstimator.estimateTraffic(domain) || undefined;

    // Qualify lead
    lead.isQualified = this.qualifyLead(lead, criteria);
    lead.qualificationScore = this.calculateQualificationScore(lead, criteria);

    if (lead.isQualified) {
      lead.status = LeadStatus.QUALIFIED;
      lead.tags.push('qualified');
    }

    lead.updatedAt = new Date();
    this.leads.set(leadId, lead);

    logger.info(`Lead ${leadId} discovered and qualified:`, {
      domain: lead.domain,
      isQualified: lead.isQualified,
      score: lead.qualificationScore,
    });

    return lead;
  }

  private qualifyLead(lead: Lead, criteria: QualificationCriteria): boolean {
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

  private evaluateRule(lead: Lead, rule: any): boolean {
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

  private calculateQualificationScore(lead: Lead, criteria: QualificationCriteria): number {
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

  async getLead(id: string): Promise<Lead | null> {
    return this.leads.get(id) || null;
  }

  async getAllLeads(filters?: {
    status?: LeadStatus;
    isQualified?: boolean;
    minScore?: number;
  }): Promise<Lead[]> {
    let leads = Array.from(this.leads.values());

    if (filters?.status) {
      leads = leads.filter((l) => l.status === filters.status);
    }

    if (filters?.isQualified !== undefined) {
      leads = leads.filter((l) => l.isQualified === filters.isQualified);
    }

    if (filters?.minScore !== undefined) {
      const minScore = filters.minScore;
      leads = leads.filter((l) => (l.qualificationScore || 0) >= minScore);
    }

    return leads;
  }

  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead | null> {
    const lead = this.leads.get(id);
    if (!lead) return null;

    Object.assign(lead, updates);
    lead.updatedAt = new Date();

    this.leads.set(id, lead);

    // Sync to Notion
    if (lead.isQualified) {
      const notionPageId = await notionService.syncLead(lead);
      if (notionPageId && !lead.notionPageId) {
        lead.notionPageId = notionPageId;
        lead.lastSyncedAt = new Date();
      }
    }

    return lead;
  }

  async deleteLead(id: string): Promise<boolean> {
    return this.leads.delete(id);
  }

  async syncAllToNotion(): Promise<void> {
    const qualifiedLeads = await this.getAllLeads({ isQualified: true });
    await notionService.batchSyncLeads(qualifiedLeads);
  }
}

export default new LeadService();
