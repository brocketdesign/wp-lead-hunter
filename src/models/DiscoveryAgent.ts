import mongoose, { Document, Schema } from 'mongoose';

export interface IDiscoveredBlog {
  blog_name: string;
  blog_name_citation?: string;
  url: string;
  url_citation?: string;
  contact_email?: string;
  contact_email_citation?: string;
  contact_form_link?: string;
  contact_form_link_citation?: string;
  platform?: string;
  platform_citation?: string;
  topics?: string | string[]; // Accept both string (from Firecrawl) and array (preferred format)
  topics_citation?: string;
  monthly_unique_users_approx?: string;
  monthly_unique_users_approx_citation?: string;
  has_profile_page?: boolean;
  has_profile_page_citation?: string;
  // Traffic information from seoreviewtools API
  traffic?: number;
  domainAge?: number;
  globalRank?: number;
  countryRank?: number;
  monthlyVisits?: number;
}

export interface IDiscoveryAgent extends Document {
  clerkUserId: string;
  name: string;
  description: string;
  firecrawlPrompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: IDiscoveredBlog[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const discoveredBlogSchema = new Schema<IDiscoveredBlog>(
  {
    blog_name: { type: String, required: true },
    blog_name_citation: String,
    url: { type: String, required: true },
    url_citation: String,
    contact_email: String,
    contact_email_citation: String,
    contact_form_link: String,
    contact_form_link_citation: String,
    platform: String,
    platform_citation: String,
    topics: {
      type: Schema.Types.Mixed,
      // Accept both string (from Firecrawl) and array format
    },
    topics_citation: String,
    monthly_unique_users_approx: String,
    monthly_unique_users_approx_citation: String,
    has_profile_page: Boolean,
    has_profile_page_citation: String,
    // Traffic information
    traffic: Number,
    domainAge: Number,
    globalRank: Number,
    countryRank: Number,
    monthlyVisits: Number,
  },
  { _id: false }
);

const discoveryAgentSchema = new Schema<IDiscoveryAgent>(
  {
    clerkUserId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    firecrawlPrompt: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    results: [discoveredBlogSchema],
    error: String,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
discoveryAgentSchema.index({ clerkUserId: 1, createdAt: -1 });
discoveryAgentSchema.index({ clerkUserId: 1, status: 1 });

export const DiscoveryAgent = mongoose.model<IDiscoveryAgent>(
  'DiscoveryAgent',
  discoveryAgentSchema
);
