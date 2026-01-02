import { Request, Response } from 'express';
import leadService from '../../services/lead.service';
import { LeadStatus } from '../../types';
import logger from '../../utils/logger';
import { getErrorMessage } from '../../utils/helpers';
import config from '../../config';

export class LeadController {
  async discoverLead(req: Request, res: Response): Promise<void> {
    try {
      const { url } = req.body;

      if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
      }

      const criteria = {
        minDomainAge: config.discovery.minDomainAgeMonths,
        minTraffic: config.discovery.minTrafficThreshold,
        requireEmail: false,
      };

      const lead = await leadService.discoverAndQualifyLead(url, criteria);

      res.status(201).json({
        success: true,
        data: lead,
      });
    } catch (error) {
      logger.error('Error discovering lead:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to discover lead',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getLeads(req: Request, res: Response): Promise<void> {
    try {
      const { status, isQualified, minScore } = req.query;

      const filters: any = {};
      if (status) filters.status = status as LeadStatus;
      if (isQualified !== undefined) filters.isQualified = isQualified === 'true';
      if (minScore) filters.minScore = parseInt(minScore as string, 10);

      const leads = await leadService.getAllLeads(filters);

      res.json({
        success: true,
        count: leads.length,
        data: leads,
      });
    } catch (error) {
      logger.error('Error getting leads:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to get leads',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getLead(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const lead = await leadService.getLead(id);

      if (!lead) {
        res.status(404).json({ error: 'Lead not found' });
        return;
      }

      res.json({
        success: true,
        data: lead,
      });
    } catch (error) {
      logger.error('Error getting lead:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to get lead',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updateLead(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const lead = await leadService.updateLead(id, updates);

      if (!lead) {
        res.status(404).json({ error: 'Lead not found' });
        return;
      }

      res.json({
        success: true,
        data: lead,
      });
    } catch (error) {
      logger.error('Error updating lead:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to update lead',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async deleteLead(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await leadService.deleteLead(id);

      if (!deleted) {
        res.status(404).json({ error: 'Lead not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Lead deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting lead:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to delete lead',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async syncToNotion(_req: Request, res: Response): Promise<void> {
    try {
      await leadService.syncAllToNotion();

      res.json({
        success: true,
        message: 'Leads synced to Notion successfully',
      });
    } catch (error) {
      logger.error('Error syncing to Notion:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Failed to sync to Notion',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default new LeadController();
