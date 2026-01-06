import { v4 as uuidv4 } from 'uuid';
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

export class EmailService {
  private templates: Map<string, EmailTemplate> = new Map();

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

  async sendEmail(lead: Lead, templateId?: string): Promise<EmailRecord> {
    logger.info(`Preparing email for lead ${lead.id}`);

    const template = templateId ? this.templates.get(templateId) : undefined;

    // Generate personalized email
    const { subject, body } = await openaiService.generatePersonalizedEmail(lead, template);

    // Create email record
    const emailRecord: EmailRecord = {
      id: uuidv4(),
      sentAt: new Date(),
      subject,
      body,
      status: EmailStatus.PENDING,
    };

    try {
      // In production, integrate with email service provider (SendGrid, AWS SES, etc.)
      await this.sendViaProvider(lead, subject, body);

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

  private async sendViaProvider(lead: Lead, subject: string, _body: string): Promise<void> {
    // Placeholder for email provider integration
    // In production, integrate with:
    // - SendGrid
    // - AWS SES
    // - Mailgun
    // - etc.

    if (!lead.email) {
      throw new Error('Lead has no email address');
    }

    logger.info('Email send simulated (no provider configured)', {
      to: lead.email,
      subject,
    });

    // Simulate sending
    return Promise.resolve();
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
