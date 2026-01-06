import { Request, Response } from 'express';
import emailService from '../../services/email.service';
import leadService from '../../services/lead.service';
import openaiService from '../../services/openai.service';
import logger from '../../utils/logger';
import { getErrorMessage } from '../../utils/helpers';
import { LeadStatus, EmailTemplateCategory } from '../../types';
import { getUserId } from '../middleware/auth';

// Define valid categories
const VALID_CATEGORIES: EmailTemplateCategory[] = [
  'introduction',
  'follow_up',
  'collaboration',
  'guest_post',
  'link_building',
  'partnership',
  'feedback_request',
  'thank_you',
  'reengagement',
  'custom',
];

export class EmailController {
  // ==================== Initialize Templates ====================
  async initializeTemplates(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      logger.info('initializeTemplates called', { clerkUserId });
      
      if (!clerkUserId) {
        logger.warn('initializeTemplates: No clerkUserId found in request');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await emailService.initializeTemplatesForUser(clerkUserId);
      logger.info('initializeTemplates completed', { clerkUserId, result });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error initializing templates:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to initialize templates',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async sendEmail(req: Request, res: Response): Promise<void> {
    try {
      const { leadId, templateId } = req.body;

      if (!leadId) {
        res.status(400).json({ error: 'Lead ID is required' });
        return;
      }

      const lead = await leadService.getLead(leadId);
      if (!lead) {
        res.status(404).json({ error: 'Lead not found' });
        return;
      }

      if (!lead.email) {
        res.status(400).json({ error: 'Lead has no email address' });
        return;
      }

      const emailRecord = await emailService.sendEmail(lead, templateId);

      // Update lead
      lead.emailsSent.push(emailRecord);
      lead.outreachAttempts += 1;
      lead.lastOutreachDate = new Date();
      if (lead.status === LeadStatus.QUALIFIED) {
        lead.status = LeadStatus.CONTACTED;
      }

      await leadService.updateLead(leadId, lead);

      res.json({
        success: true,
        data: emailRecord,
      });
    } catch (error) {
      logger.error('Error sending email:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to send email',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Support both 'body' (frontend) and 'bodyTemplate' (backend) field names
      const { name, subject, bodyTemplate, body, variables, category } = req.body;
      const templateBody = bodyTemplate || body;

      if (!name || !subject || !templateBody) {
        res.status(400).json({
          error: 'Name, subject, and body are required',
        });
        return;
      }

      const templateCategory = (category && VALID_CATEGORIES.includes(category)) ? category : 'custom';

      const template = await emailService.createTemplateInDb(
        clerkUserId,
        name,
        templateCategory,
        subject,
        templateBody,
        variables || []
      );

      // Transform to match frontend expected format
      res.status(201).json({
        success: true,
        data: {
          id: template._id,
          name: template.name,
          subject: template.subject,
          body: template.bodyTemplate,
          category: template.category,
          variables: template.variables,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Error creating template:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to create template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      logger.debug('getTemplates called', { clerkUserId });
      
      if (!clerkUserId) {
        logger.warn('getTemplates: No clerkUserId found in request');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Use database-backed templates
      const templates = await emailService.getAllTemplatesFromDb(clerkUserId);
      logger.debug('Templates fetched from DB', { count: templates.length, clerkUserId });

      // Transform to match frontend expected format (body instead of bodyTemplate)
      const transformedTemplates = templates.map(t => ({
        id: t._id,
        name: t.name,
        subject: t.subject,
        body: t.bodyTemplate,
        category: t.category,
        variables: t.variables,
        isDefault: t.isDefault,
        description: t.description,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));

      res.json({
        success: true,
        count: transformedTemplates.length,
        data: transformedTemplates,
      });
    } catch (error) {
      logger.error('Error getting templates:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to get templates',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const template = await emailService.getTemplateFromDb(id);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      // Transform to match frontend expected format
      const transformedTemplate = {
        id: template._id,
        name: template.name,
        subject: template.subject,
        body: template.bodyTemplate,
        category: template.category,
        variables: template.variables,
        isDefault: template.isDefault,
        description: template.description,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      };

      res.json({
        success: true,
        data: transformedTemplate,
      });
    } catch (error) {
      logger.error('Error getting template:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to get template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, subject, body, bodyTemplate, variables, category } = req.body;
      
      // Map frontend field names to backend field names
      const updates: Record<string, unknown> = {};
      if (name) updates.name = name;
      if (subject) updates.subject = subject;
      if (body || bodyTemplate) updates.bodyTemplate = body || bodyTemplate;
      if (variables) updates.variables = variables;
      if (category && VALID_CATEGORIES.includes(category)) updates.category = category;

      const template = await emailService.updateTemplateInDb(id, updates);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      // Transform to match frontend expected format
      res.json({
        success: true,
        data: {
          id: template._id,
          name: template.name,
          subject: template.subject,
          body: template.bodyTemplate,
          category: template.category,
          variables: template.variables,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Error updating template:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to update template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await emailService.deleteTemplateFromDb(id);

      if (!deleted) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting template:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to delete template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ==================== Database-backed Template Methods ====================

  async createTemplateInDb(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { name, category, subject, bodyTemplate, variables, tags, description } = req.body;

      if (!name || !subject || !bodyTemplate) {
        res.status(400).json({
          error: 'Name, subject, and bodyTemplate are required',
        });
        return;
      }

      const templateCategory = (category && VALID_CATEGORIES.includes(category)) ? category : 'custom';

      const template = await emailService.createTemplateInDb(
        clerkUserId,
        name,
        templateCategory,
        subject,
        bodyTemplate,
        variables || [],
        { tags, description }
      );

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      logger.error('Error creating template in DB:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to create template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getAllTemplatesFromDb(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const templates = await emailService.getAllTemplatesFromDb(clerkUserId);

      res.json({
        success: true,
        count: templates.length,
        data: templates,
      });
    } catch (error) {
      logger.error('Error getting templates from DB:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to get templates',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getTemplatesByCategory(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { category } = req.params;

      if (!VALID_CATEGORIES.includes(category as EmailTemplateCategory)) {
        res.status(400).json({ 
          error: 'Invalid category',
          validCategories: VALID_CATEGORIES,
        });
        return;
      }

      const templates = await emailService.getTemplatesByCategory(
        clerkUserId, 
        category as EmailTemplateCategory
      );

      res.json({
        success: true,
        category,
        count: templates.length,
        data: templates,
      });
    } catch (error) {
      logger.error('Error getting templates by category:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to get templates by category',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getTemplateCategoryCounts(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const counts = await emailService.getTemplateCategoryCounts(clerkUserId);

      res.json({
        success: true,
        data: counts,
        categories: VALID_CATEGORIES.map(cat => ({
          id: cat,
          name: cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          count: counts[cat] || 0,
        })),
      });
    } catch (error) {
      logger.error('Error getting template category counts:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to get template category counts',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getTemplateFromDb(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const template = await emailService.getTemplateFromDb(id);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      logger.error('Error getting template from DB:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to get template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updateTemplateInDb(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Validate category if provided
      if (updates.category && !VALID_CATEGORIES.includes(updates.category)) {
        res.status(400).json({ 
          error: 'Invalid category',
          validCategories: VALID_CATEGORIES,
        });
        return;
      }

      const template = await emailService.updateTemplateInDb(id, updates);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      logger.error('Error updating template in DB:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to update template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async deleteTemplateFromDb(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await emailService.deleteTemplateFromDb(id);

      if (!deleted) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting template from DB:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to delete template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async duplicateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const { name } = req.body;

      const template = await emailService.duplicateTemplate(id, clerkUserId, name);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      logger.error('Error duplicating template:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to duplicate template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async searchTemplates(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const templates = await emailService.searchTemplates(clerkUserId, q);

      res.json({
        success: true,
        query: q,
        count: templates.length,
        data: templates,
      });
    } catch (error) {
      logger.error('Error searching templates:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to search templates',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ==================== Generate Email ====================
  async generateEmail(req: Request, res: Response): Promise<void> {
    try {
      const { leadId, templateId } = req.body;

      if (!leadId) {
        res.status(400).json({ error: 'Lead ID is required' });
        return;
      }

      // Get the lead
      const lead = await leadService.getLead(leadId);
      if (!lead) {
        res.status(404).json({ error: 'Lead not found' });
        return;
      }

      // Get template if specified
      let template = undefined;
      if (templateId) {
        const dbTemplate = await emailService.getTemplateFromDb(templateId);
        if (dbTemplate) {
          // Convert to the format expected by openaiService
          template = {
            id: dbTemplate._id?.toString() || templateId,
            name: dbTemplate.name,
            category: dbTemplate.category,
            subject: dbTemplate.subject,
            bodyTemplate: dbTemplate.bodyTemplate,
            variables: dbTemplate.variables,
            createdAt: dbTemplate.createdAt,
            updatedAt: dbTemplate.updatedAt,
          };
        }
      }

      // Generate the email using OpenAI
      const { subject, body } = await openaiService.generatePersonalizedEmail(lead, template);

      // Increment template usage if a template was used
      if (templateId) {
        await emailService.incrementTemplateUsage(templateId);
      }

      logger.info('Email generated successfully', { leadId, templateId, hasTemplate: !!template });

      res.json({
        success: true,
        data: {
          subject,
          body,
        },
      });
    } catch (error) {
      logger.error('Error generating email:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to generate email',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default new EmailController();
