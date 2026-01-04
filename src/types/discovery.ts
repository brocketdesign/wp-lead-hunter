// Types for enhanced discovery with streaming and logging

export interface DiscoveryLogEntry {
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'error' | 'progress';
  message: string;
  details?: Record<string, unknown>;
}

export interface DiscoveryChunk {
  type: 'log' | 'leads' | 'keywords' | 'complete' | 'error';
  data: DiscoveryLogEntry | DiscoveredLeadChunk | KeywordsChunk | CompleteChunk | ErrorChunk;
}

export interface DiscoveredLeadChunk {
  leads: DiscoveredLead[];
  totalSoFar: number;
  searchedKeywords: string[];
}

export interface KeywordsChunk {
  suggestedKeywords: string[];
  expandedKeywords: string[];
}

export interface CompleteChunk {
  totalFound: number;
  filteredOut: number;
  searchedKeywords: string[];
  discoverySessionId: string;
}

export interface ErrorChunk {
  error: string;
  details?: string;
}

export interface DiscoveredLead {
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
  isSaved?: boolean;
  matchedKeyword?: string; // Which keyword found this lead
}

export interface BlogClassification {
  isPersonalBlog: boolean;
  isCorporateSite: boolean;
  blogType: 'personal' | 'indie' | 'corporate' | 'unknown';
  confidence: number;
  reasoning: string;
  niche?: string;
  estimatedAudience?: string;
  isGoodCollaborationTarget: boolean;
  collaborationPotentialReason: string;
}

export interface EnhancedDiscoveryOptions {
  keywords: string[];
  minTraffic?: number;
  maxResults?: number;
  expandKeywords?: boolean;
  autoSearchExpanded?: boolean; // Automatically search with expanded keywords
  maxPagesPerSearch?: number; // Search multiple pages of results
  openaiApiKey?: string;
  userId?: string;
  filterCorporate?: boolean;
  requireActiveBlog?: boolean;
  language?: string;
  excludeWordPressCom?: boolean;
  chunkSize?: number; // Return results in chunks (default 10)
}
