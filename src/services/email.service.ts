import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';
import { Lead, EmailRecord, EmailStatus, EmailTemplate, EmailTemplateCategory } from '../types';
import { 
  EmailTemplate as EmailTemplateModel, 
  IEmailTemplate,
  seedDefaultTemplates,
  getTemplatesByCategory,
  getTemplateCategoryCounts,
} from '../models/EmailTemplate';
import { UserSettings } from '../models/UserSettings';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';
import openaiService from './openai.service';
import notionService from './notion.service';
import config from '../config';

// Language options for email generation
export const EMAIL_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'zh', name: 'Chinese (中文)' },
  { code: 'ko', name: 'Korean (한국어)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'it', name: 'Italian (Italiano)' },
  { code: 'ru', name: 'Russian (Русский)' },
];

export class EmailService {
  private templates: Map<string, EmailTemplate> = new Map();
  private resendClient: Resend | null = null;

  constructor() {
    // Initialize Resend client if API key is available
    if (config.resend?.apiKey) {
      this.resendClient = new Resend(config.resend.apiKey);
      logger.info('Resend client initialized');
    }
  }

  /**
   * Initialize Resend client with user's API key
   */
  initResendWithApiKey(apiKey: string): void {
    this.resendClient = new Resend(apiKey);
  }

  /**
   * Check if email sending is configured
   */
  isEmailSendingConfigured(): boolean {
    return this.resendClient !== null;
  }

  // Initialize default templates for a user
  async initializeTemplatesForUser(clerkUserId: string): Promise<{
    seeded: boolean;
    count: number;
    message: string;
    alreadyInitialized: boolean;
  }> {
    // Check if already initialized in user settings
    const userSettings = await UserSettings.findOne({ clerkUserId });
    
    if (userSettings?.emailTemplatesInitialized) {
      const existingCount = await EmailTemplateModel.countDocuments({ clerkUserId, isDefault: true });
      return {
        seeded: false,
        count: existingCount,
        message: 'Email templates were already initialized for this user',
        alreadyInitialized: true,
      };
    }

    // Seed the templates
    const result = await seedDefaultTemplates(clerkUserId);
    
    // Update user settings to mark as initialized
    await UserSettings.findOneAndUpdate(
      { clerkUserId },
      { 
        emailTemplatesInitialized: true,
        emailTemplatesInitializedAt: new Date(),
      },
      { upsert: true }
    );

    logger.info(`Template initialization for user ${clerkUserId}: ${result.message}`);
    
    return {
      ...result,
      alreadyInitialized: false,
    };
  }

  async sendEmail(lead: Lead, templateId?: string, options?: {
    language?: string;
    fromEmail?: string;
    fromName?: string;
  }): Promise<EmailRecord> {
    logger.info(`Preparing email for lead ${lead.id}`);

    const template = templateId ? this.templates.get(templateId) : undefined;

    // Generate personalized email with language support
    const { subject, body } = await openaiService.generatePersonalizedEmail(lead, template, options?.language);

    // Create email record
    const emailRecord: EmailRecord = {
      id: uuidv4(),
      sentAt: new Date(),
      subject,
      body,
      status: EmailStatus.PENDING,
    };

    try {
      // Send via Resend if configured
      await this.sendViaProvider(lead, subject, body, options);

      emailRecord.status = EmailStatus.SENT;
      logger.info(`Email sent to lead ${lead.id}`);

      // Sync event to Notion
      await notionService.syncEvent(lead.id, 'email_sent', {
        subject,
        sentAt: emailRecord.sentAt,
      });
    } catch (error) {
      logger.error(`Failed to send email to lead ${lead.id}:`, { error: getErrorMessage(error) });
      emailRecord.status = EmailStatus.FAILED;
    }

    return emailRecord;
  }

  /**
   * Send email via Resend API
   */
  private async sendViaProvider(
    lead: Lead, 
    subject: string, 
    body: string,
    options?: {
      fromEmail?: string;
      fromName?: string;
    }
  ): Promise<{ id?: string; success: boolean }> {
    if (!lead.email) {
      throw new Error('Lead has no email address');
    }

    // Use Resend if client is configured
    if (this.resendClient) {
      const fromEmail = options?.fromEmail || config.resend?.fromEmail || 'onboarding@resend.dev';
      const fromName = options?.fromName || config.resend?.fromName || 'WP Lead Hunter';
      
      try {
        const result = await this.resendClient.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: [lead.email],
          subject,
          html: body.replace(/\n/g, '<br>'),
          text: body,
        });

        logger.info('Email sent via Resend', {
          to: lead.email,
          subject,
          resendId: result.data?.id,
        });

        return { id: result.data?.id, success: true };
      } catch (error) {
        logger.error('Resend email failed:', { error: getErrorMessage(error) });
        throw error;
      }
    }

    // Fallback: simulate sending if no provider is configured
    logger.info('Email send simulated (no provider configured)', {
      to: lead.email,
      subject,
    });

    return { success: true };
  }

  /**
   * Send bulk emails to multiple leads
   */
  async sendBulkEmails(
    leads: Lead[],
    templateId: string,
    options: {
      language?: string;
      fromEmail?: string;
      fromName?: string;
      delayMs?: number;
    }
  ): Promise<{
    sent: number;
    failed: number;
    results: Array<{ leadId: string; success: boolean; error?: string }>;
  }> {
    const results: Array<{ leadId: string; success: boolean; error?: string }> = [];
    let sent = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        await this.sendEmail(lead, templateId, options);
        results.push({ leadId: lead.id, success: true });
        sent++;
      } catch (error) {
        results.push({ 
          leadId: lead.id, 
          success: false, 
          error: getErrorMessage(error) 
        });
        failed++;
      }

      // Add delay between emails to avoid rate limiting
      if (options.delayMs && options.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, options.delayMs));
      }
    }

    logger.info(`Bulk email completed: ${sent} sent, ${failed} failed`);
    return { sent, failed, results };
  }

  // ==================== Database-backed Template Methods ====================

  async createTemplateInDb(
    clerkUserId: string,
    name: string,
    category: EmailTemplateCategory,
    subject: string,
    bodyTemplate: string,
    variables: string[],
    options?: {
      tags?: string[];
      description?: string;
    }
  ): Promise<IEmailTemplate> {
    const template = new EmailTemplateModel({
      clerkUserId,
      name,
      category,
      subject,
      bodyTemplate,
      variables,
      tags: options?.tags || [],
      description: options?.description,
    });

    await template.save();
    logger.info(`Created email template in DB: ${name} (${category})`);

    return template;
  }

  async getTemplateFromDb(id: string): Promise<IEmailTemplate | null> {
    return EmailTemplateModel.findById(id);
  }

  async getAllTemplatesFromDb(clerkUserId: string): Promise<IEmailTemplate[]> {
    return EmailTemplateModel.find({ clerkUserId, isActive: true }).sort({ category: 1, name: 1 });
  }

  async getTemplatesByCategory(clerkUserId: string, category: EmailTemplateCategory): Promise<IEmailTemplate[]> {
    return getTemplatesByCategory(clerkUserId, category);
  }

  async getTemplateCategoryCounts(clerkUserId: string): Promise<Record<EmailTemplateCategory, number>> {
    return getTemplateCategoryCounts(clerkUserId);
  }

  async updateTemplateInDb(id: string, updates: Partial<IEmailTemplate>): Promise<IEmailTemplate | null> {
    const template = await EmailTemplateModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );

    if (template) {
      logger.info(`Updated email template in DB: ${template.name}`);
    }

    return template;
  }

  async deleteTemplateFromDb(id: string): Promise<boolean> {
    const result = await EmailTemplateModel.findByIdAndDelete(id);
    return !!result;
  }

  async incrementTemplateUsage(id: string): Promise<void> {
    await EmailTemplateModel.findByIdAndUpdate(id, {
      $inc: { usageCount: 1 },
      lastUsedAt: new Date(),
    });
  }

  async duplicateTemplate(id: string, clerkUserId: string, newName?: string): Promise<IEmailTemplate | null> {
    const original = await EmailTemplateModel.findById(id);
    if (!original) return null;

    const duplicate = new EmailTemplateModel({
      clerkUserId,
      name: newName || `${original.name} (Copy)`,
      category: original.category,
      subject: original.subject,
      bodyTemplate: original.bodyTemplate,
      variables: original.variables,
      tags: original.tags,
      description: original.description,
      isDefault: false,
    });

    await duplicate.save();
    logger.info(`Duplicated email template: ${original.name} -> ${duplicate.name}`);

    return duplicate;
  }

  async searchTemplates(clerkUserId: string, query: string): Promise<IEmailTemplate[]> {
    return EmailTemplateModel.find({
      clerkUserId,
      isActive: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { subject: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: { $in: [new RegExp(query, 'i')] } },
      ],
    }).sort({ usageCount: -1 });
  }

  // ==================== In-Memory Template Methods (Legacy) ====================

  async createTemplate(
    name: string,
    subject: string,
    bodyTemplate: string,
    variables: string[]
  ): Promise<EmailTemplate> {
    const template: EmailTemplate = {
      id: uuidv4(),
      name,
      category: 'custom',
      subject,
      bodyTemplate,
      variables,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(template.id, template);
    logger.info(`Created email template: ${name}`);

    return template;
  }

  async getTemplate(id: string): Promise<EmailTemplate | null> {
    return this.templates.get(id) || null;
  }

  async getAllTemplates(): Promise<EmailTemplate[]> {
    return Array.from(this.templates.values());
  }

  async updateTemplate(id: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate | null> {
    const template = this.templates.get(id);
    if (!template) return null;

    Object.assign(template, updates);
    template.updatedAt = new Date();

    this.templates.set(id, template);
    return template;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.templates.delete(id);
  }

  async trackEmailOpen(emailId: string): Promise<void> {
    logger.info(`Email opened: ${emailId}`);
    // Track email open event
    // Could sync to Notion or update lead status
  }

  async trackEmailClick(emailId: string, url: string): Promise<void> {
    logger.info(`Email link clicked: ${emailId}, URL: ${url}`);
    // Track email click event
  }
}

export default new EmailService();
