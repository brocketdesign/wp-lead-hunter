import mongoose, { Document, Schema } from 'mongoose';

export interface IExcludedUrl extends Document {
  clerkUserId: string;
  url: string;
  domain: string;
  reason?: string;
  addedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const excludedUrlSchema = new Schema<IExcludedUrl>(
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
    reason: {
      type: String,
      default: '',
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicates per user
excludedUrlSchema.index({ clerkUserId: 1, domain: 1 }, { unique: true });

// Index for querying all excluded URLs for a user
excludedUrlSchema.index({ clerkUserId: 1, addedAt: -1 });

export const ExcludedUrl = mongoose.model<IExcludedUrl>('ExcludedUrl', excludedUrlSchema);
export default ExcludedUrl;
