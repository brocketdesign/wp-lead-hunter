import mongoose, { Document, Schema } from 'mongoose';

export interface ILead extends Document {
  clerkUserId: string;
  url: string;
  domain: string;
  title?: string;
  description?: string;
  email?: string;
  contactName?: string;

  // WordPress detection
  isWordPress: boolean;
  
  // Blog classification (OpenAI analysis)
  blogType: 'personal' | 'indie' | 'corporate' | 'unknown';
  blogClassification?: {
    isPersonalBlog: boolean;
    isCorporateSite: boolean;
    confidence: number;
    reasoning: string;
    niche?: string;
    estimatedAudience?: string;
  };

  // Activity metrics
  isActiveBlog: boolean;
  lastPostDate?: Date;
  postFrequency?: string; // e.g., 'weekly', 'monthly', 'irregular'
  estimatedPostsPerMonth?: number;

  // Qualification metrics
  traffic?: number;
  domainAge?: number;
  isQualified: boolean;
  qualificationScore?: number;

  // Outreach status
  status: string;
  outreachAttempts: number;
  lastOutreachDate?: Date;

  // Metadata
  tags: string[];
  notes?: string;
  source?: string; // Where the lead was discovered from (keywords used)
  discoverySessionId?: string; // Group leads from same discovery session

  // Notion sync
  notionPageId?: string;
  lastSyncedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
  {
    clerkUserId: {
      type: String,
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    domain: {
      type: String,
      required: true,
      index: true,
    },
    title: String,
    description: String,
    email: String,
    contactName: String,

    // WordPress detection
    isWordPress: {
      type: Boolean,
      default: false,
    },

    // Blog classification
    blogType: {
      type: String,
      enum: ['personal', 'indie', 'corporate', 'unknown'],
      default: 'unknown',
    },
    blogClassification: {
      isPersonalBlog: Boolean,
      isCorporateSite: Boolean,
      confidence: Number,
      reasoning: String,
      niche: String,
      estimatedAudience: String,
    },

    // Activity metrics
    isActiveBlog: {
      type: Boolean,
      default: false,
    },
    lastPostDate: Date,
    postFrequency: String,
    estimatedPostsPerMonth: Number,

    // Qualification metrics
    traffic: Number,
    domainAge: Number,
    isQualified: {
      type: Boolean,
      default: false,
    },
    qualificationScore: Number,

    // Outreach status
    status: {
      type: String,
      enum: ['DISCOVERED', 'QUALIFIED', 'CONTACTED', 'RESPONDED', 'CONVERTED', 'REJECTED', 'ARCHIVED'],
      default: 'DISCOVERED',
    },
    outreachAttempts: {
      type: Number,
      default: 0,
    },
    lastOutreachDate: Date,

    // Metadata
    tags: [{
      type: String,
    }],
    notes: String,
    source: String,
    discoverySessionId: String,

    // Notion sync
    notionPageId: String,
    lastSyncedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Compound index for user + domain to prevent duplicates per user
leadSchema.index({ clerkUserId: 1, domain: 1 }, { unique: true });

// Index for querying by discovery session
leadSchema.index({ clerkUserId: 1, discoverySessionId: 1 });

// Index for filtering qualified leads
leadSchema.index({ clerkUserId: 1, isQualified: 1, qualificationScore: -1 });

// Index for filtering by blog type
leadSchema.index({ clerkUserId: 1, blogType: 1, isActiveBlog: 1 });

export const Lead = mongoose.model<ILead>('Lead', leadSchema);
export default Lead;
