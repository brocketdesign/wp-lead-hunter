import mongoose, { Document, Schema } from 'mongoose';

export interface IDiscoveredLead {
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
  isGoodCollaborationTarget?: boolean;
  collaborationReason?: string;
  estimatedAudience?: string;
  isActiveBlog?: boolean;
  isGoodTarget?: boolean;
  isSaved?: boolean; // Track if this lead has been saved to the Leads collection
}

export interface IDiscoverySession extends Document {
  clerkUserId: string;
  sessionId: string;
  source: string; // Keywords used for discovery
  leads: IDiscoveredLead[];
  suggestedKeywords: string[];
  totalFound: number;
  filteredOut: number;
  createdAt: Date;
  updatedAt: Date;
}

const discoveredLeadSchema = new Schema<IDiscoveredLead>(
  {
    url: { type: String, required: true },
    title: String,
    description: String,
    email: String,
    isWordPress: { type: Boolean, default: false },
    domainAge: Number,
    traffic: Number,
    score: { type: Number, default: 0 },
    blogType: {
      type: String,
      enum: ['personal', 'indie', 'corporate', 'unknown'],
      default: 'unknown',
    },
    niche: String,
    wpConfidenceScore: Number,
    isGoodCollaborationTarget: Boolean,
    collaborationReason: String,
    estimatedAudience: String,
    isActiveBlog: Boolean,
    isGoodTarget: Boolean,
    isSaved: { type: Boolean, default: false },
  },
  { _id: false }
);

const discoverySessionSchema = new Schema<IDiscoverySession>(
  {
    clerkUserId: {
      type: String,
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
    },
    leads: [discoveredLeadSchema],
    suggestedKeywords: [String],
    totalFound: { type: Number, default: 0 },
    filteredOut: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
discoverySessionSchema.index({ clerkUserId: 1, createdAt: -1 });

export const DiscoverySession = mongoose.model<IDiscoverySession>(
  'DiscoverySession',
  discoverySessionSchema
);
