export interface Lead {
  id: string;
  url: string;
  domain: string;
  title?: string;
  description?: string;
  email?: string;
  contactName?: string;
  
  // Qualification metrics
  traffic?: number;
  domainAge?: number;
  isWordPress: boolean;
  isQualified: boolean;
  qualificationScore?: number;
  
  // Outreach
  status: LeadStatus;
  outreachAttempts: number;
  lastOutreachDate?: Date;
  emailsSent: EmailRecord[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  notes?: string;
  
  // Notion sync
  notionPageId?: string;
  lastSyncedAt?: Date;
}

export enum LeadStatus {
  DISCOVERED = 'DISCOVERED',
  QUALIFIED = 'QUALIFIED',
  CONTACTED = 'CONTACTED',
  RESPONDED = 'RESPONDED',
  CONVERTED = 'CONVERTED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED',
}

export interface EmailRecord {
  id: string;
  sentAt: Date;
  subject: string;
  body: string;
  status: EmailStatus;
  openedAt?: Date;
  clickedAt?: Date;
}

export enum EmailStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  CLICKED = 'CLICKED',
  BOUNCED = 'BOUNCED',
  FAILED = 'FAILED',
}

export interface DiscoveryConfig {
  keywords: string[];
  minDomainAgeMonths: number;
  minTraffic: number;
  maxResults: number;
  filters?: DiscoveryFilters;
}

export interface DiscoveryFilters {
  excludeDomains?: string[];
  includeLanguages?: string[];
  excludeLanguages?: string[];
  regions?: string[];
}

export interface QualificationCriteria {
  minDomainAge: number;
  minTraffic: number;
  requireEmail: boolean;
  customRules?: QualificationRule[];
}

export interface QualificationRule {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'contains' | 'exists';
  value: any;
  weight: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyTemplate: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  templateId: string;
  targetLeads: string[];
  sentCount: number;
  openRate?: number;
  clickRate?: number;
  responseRate?: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}
