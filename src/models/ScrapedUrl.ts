import mongoose, { Document, Schema } from 'mongoose';

export interface IScrapedUrl extends Document {
  url: string;
  agentId?: string; // Reference to the agent that scraped it
  clerkUserId?: string; // User who owns the agent
  scrapedAt: Date;
}

const scrapedUrlSchema = new Schema<IScrapedUrl>(
  {
    url: {
      type: String,
      required: true,
      index: true,
      unique: true, // Ensure each URL is only stored once
    },
    agentId: {
      type: String,
      index: true,
    },
    clerkUserId: {
      type: String,
      index: true,
    },
    scrapedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // We don't need updatedAt
  }
);

// Index for efficient queries
scrapedUrlSchema.index({ url: 1 }, { unique: true });
scrapedUrlSchema.index({ clerkUserId: 1, scrapedAt: -1 });

export const ScrapedUrl = mongoose.model<IScrapedUrl>('ScrapedUrl', scrapedUrlSchema);
export default ScrapedUrl;
