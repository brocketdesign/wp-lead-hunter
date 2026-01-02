import { Request, Response } from 'express';
import emailService from '../../services/email.service';
import leadService from '../../services/lead.service';
import logger from '../../utils/logger';
import { getErrorMessage } from '../../utils/helpers';
import { LeadStatus } from '../../types';

export class EmailController {
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
      const { name, subject, bodyTemplate, variables } = req.body;

      if (!name || !subject || !bodyTemplate) {
        res.status(400).json({
          error: 'Name, subject, and bodyTemplate are required',
        });
        return;
      }

      const template = await emailService.createTemplate(
        name,
        subject,
        bodyTemplate,
        variables || []
      );

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      logger.error('Error creating template:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to create template',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getTemplates(_req: Request, res: Response): Promise<void> {
    try {
      const templates = await emailService.getAllTemplates();

      res.json({
        success: true,
        count: templates.length,
        data: templates,
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
      const template = await emailService.getTemplate(id);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        data: template,
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
      const updates = req.body;

      const template = await emailService.updateTemplate(id, updates);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        data: template,
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
      const deleted = await emailService.deleteTemplate(id);

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
}

export default new EmailController();
