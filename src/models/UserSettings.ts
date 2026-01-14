import mongoose, { Document, Schema } from 'mongoose';

export interface IUserSettings extends Document {
  clerkUserId: string;
  email: string;
  openaiApiKey?: string;
  firecrawlApiKey?: string;
  notionApiKey?: string;
  notionDatabaseId?: string;
  seoreviewtoolsApiKey?: string;
  // Resend email settings
  resendApiKey?: string;
  resendFromEmail?: string;
  resendFromName?: string;
  // Email template settings
  emailTemplatesInitialized: boolean;
  emailTemplatesInitializedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSettingsSchema = new Schema<IUserSettings>(
  {
    clerkUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      default: '',
    },
    openaiApiKey: {
      type: String,
      default: '',
    },
    firecrawlApiKey: {
      type: String,
      default: '',
    },
    notionApiKey: {
      type: String,
      default: '',
    },
    notionDatabaseId: {
      type: String,
      default: '',
    },
    seoreviewtoolsApiKey: {
      type: String,
      default: '',
    },
    // Resend email settings
    resendApiKey: {
      type: String,
      default: '',
    },
    resendFromEmail: {
      type: String,
      default: '',
    },
    resendFromName: {
      type: String,
      default: '',
    },
    // Email template settings
    emailTemplatesInitialized: {
      type: Boolean,
      default: false,
    },
    emailTemplatesInitializedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt sensitive fields before saving (in production, use proper encryption)
userSettingsSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  // Mask API keys for display
  if (obj.openaiApiKey) {
    obj.openaiApiKey = obj.openaiApiKey.slice(0, 7) + '...' + obj.openaiApiKey.slice(-4);
  }
  if (obj.firecrawlApiKey) {
    obj.firecrawlApiKey = obj.firecrawlApiKey.slice(0, 7) + '...' + obj.firecrawlApiKey.slice(-4);
  }
  if (obj.notionApiKey) {
    obj.notionApiKey = obj.notionApiKey.slice(0, 7) + '...' + obj.notionApiKey.slice(-4);
  }
  if (obj.seoreviewtoolsApiKey) {
    obj.seoreviewtoolsApiKey = obj.seoreviewtoolsApiKey.slice(0, 7) + '...' + obj.seoreviewtoolsApiKey.slice(-4);
  }
  if (obj.resendApiKey) {
    obj.resendApiKey = obj.resendApiKey.slice(0, 7) + '...' + obj.resendApiKey.slice(-4);
  }
  return obj;
};

export const UserSettings = mongoose.model<IUserSettings>('UserSettings', userSettingsSchema);
export default UserSettings;
