import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISettings extends Document {
  docId: string; // A single document id to ensure we only have one settings document
  siteName: string;
  logoEmoji: string;
  logoImage?: string;
  adminUsername?: string;
  adminPassword?: string;
}

const SettingsSchema = new Schema<ISettings>({
  docId: { type: String, default: 'global', unique: true },
  siteName: { type: String, required: true, default: 'PXL Sales Routine' },
  logoEmoji: { type: String, required: true, default: '⬡' },
  logoImage: { type: String },
  adminUsername: { type: String },
  adminPassword: { type: String },
});

export const Settings: Model<ISettings> = mongoose.models.Settings || mongoose.model<ISettings>('Settings', SettingsSchema);
