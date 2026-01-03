import mongoose, { Document, Schema } from 'mongoose';

export interface IUserSettings extends Document {
  clerkUserId: string;
  email: string;
  openaiApiKey?: string;
  notionApiKey?: string;
  notionDatabaseId?: string;
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
    notionApiKey: {
      type: String,
      default: '',
    },
    notionDatabaseId: {
      type: String,
      default: '',
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
  if (obj.notionApiKey) {
    obj.notionApiKey = obj.notionApiKey.slice(0, 7) + '...' + obj.notionApiKey.slice(-4);
  }
  return obj;
};

export const UserSettings = mongoose.model<IUserSettings>('UserSettings', userSettingsSchema);
export default UserSettings;
