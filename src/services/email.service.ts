import { v4 as uuidv4 } from 'uuid';
import { Lead, EmailRecord, EmailStatus, EmailTemplate } from '../types';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';
import openaiService from './openai.service';
import notionService from './notion.service';

export class EmailService {
  private templates: Map<string, EmailTemplate> = new Map();

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

  async createTemplate(
    name: string,
    subject: string,
    bodyTemplate: string,
    variables: string[]
  ): Promise<EmailTemplate> {
    const template: EmailTemplate = {
      id: uuidv4(),
      name,
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
