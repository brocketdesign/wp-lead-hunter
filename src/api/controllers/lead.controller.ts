import { Request, Response } from 'express';
import leadService from '../../services/lead.service';
import streamingDiscoveryService from '../../services/streamingDiscovery.service';
import openaiService from '../../services/openai.service';
import { LeadStatus } from '../../types';
import logger from '../../utils/logger';
import { getErrorMessage } from '../../utils/helpers';
import config from '../../config';
import { getUserId } from '../middleware/auth';
import { UserSettings } from '../../models';

export class LeadController {
  /**
   * Discover leads by keywords with streaming (Server-Sent Events)
   * Returns results in chunks with live progress updates
   */
  async discoverByKeywordsStreaming(req: Request, res: Response): Promise<void> {
    try {
      const { 
        keywords, 
        minTraffic,
        maxResults = 50,
        expandKeywords = true,
        autoSearchExpanded = true,
        maxPagesPerSearch = 2,
        filterCorporate = true,
        language,
        excludeWordPressCom = true,
        chunkSize = 10,
      } = req.body;

      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        res.status(400).json({ 
          success: false,
          error: 'Keywords array is required' 
        });
        return;
      }

      // Get user's OpenAI API key if available
      let openaiApiKey: string | undefined;
      const userId = getUserId(req);
      if (userId) {
        const settings = await UserSettings.findOne({ clerkUserId: userId });
        if (settings?.openaiApiKey) {
          openaiApiKey = settings.openaiApiKey;
        }
      }

      // Use streaming discovery service
      await streamingDiscoveryService.discoverWithStreaming(res, {
        keywords,
        minTraffic: minTraffic ?? config.discovery.minTrafficThreshold,
        maxResults,
        expandKeywords,
        autoSearchExpanded,
        maxPagesPerSearch,
        openaiApiKey,
        userId: userId || undefined,
        filterCorporate,
        language,
        excludeWordPressCom,
        chunkSize,
      });
    } catch (error) {
      logger.error('Error in streaming discovery:', { error: getErrorMessage(error) });
      // If headers not sent, send error response
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to start discovery stream',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Discover leads by keywords - searches for WordPress blogs
   * Now with OpenAI-powered classification to filter corporate sites
   */
  async discoverByKeywords(req: Request, res: Response): Promise<void> {
    try {
      const { 
        keywords, 
        minTraffic,
        maxResults,
        expandKeywords,
        filterCorporate = true,
        requireActiveBlog = false,
        language, // Language/region code for filtering search results
        excludeWordPressCom = true, // Filter out *.wordpress.com hosted blogs
      } = req.body;

      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        res.status(400).json({ 
          success: false,
          error: 'Keywords array is required' 
        });
        return;
      }

      // Get user's OpenAI API key if available
      let openaiApiKey: string | undefined;
      const userId = getUserId(req);
      if (userId) {
        const settings = await UserSettings.findOne({ clerkUserId: userId });
        if (settings?.openaiApiKey) {
          openaiApiKey = settings.openaiApiKey;
        }
      }

      const result = await leadService.discoverByKeywords({
        keywords,
        minTraffic: minTraffic ?? config.discovery.minTrafficThreshold,
        maxResults: maxResults ?? 20,
        expandKeywords: expandKeywords ?? true,
        openaiApiKey,
        userId: userId || undefined,
        filterCorporate,
        requireActiveBlog,
        language,
        excludeWordPressCom,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error discovering leads by keywords:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to discover leads',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Save discovered leads to the database
   */
  async saveDiscoveredLeads(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { leads, source, discoverySessionId } = req.body;

      if (!leads || !Array.isArray(leads) || leads.length === 0) {
        res.status(400).json({ success: false, error: 'Leads array is required' });
        return;
      }

      const savedLeads = await leadService.saveDiscoveredLeads(
        userId,
        leads,
        source || 'manual',
        discoverySessionId
      );

      res.json({
        success: true,
        data: {
          savedCount: savedLeads.length,
          leads: savedLeads,
        },
      });
    } catch (error) {
      logger.error('Error saving discovered leads:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to save leads',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get leads for the authenticated user
   */
  async getUserLeads(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { status, isQualified, minScore, blogType, isActiveBlog, discoverySessionId } = req.query;

      const filters: any = {};
      if (status) filters.status = status as string;
      if (isQualified !== undefined) filters.isQualified = isQualified === 'true';
      if (minScore) filters.minScore = parseInt(minScore as string, 10);
      if (blogType) filters.blogType = blogType as string;
      if (isActiveBlog !== undefined) filters.isActiveBlog = isActiveBlog === 'true';
      if (discoverySessionId) filters.discoverySessionId = discoverySessionId as string;

      const leads = await leadService.getLeadsForUser(userId, filters);

      res.json({
        success: true,
        count: leads.length,
        data: leads,
      });
    } catch (error) {
      logger.error('Error getting user leads:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to get leads',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get lead stats for the authenticated user
   */
  async getLeadStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const stats = await leadService.getLeadStats(userId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting lead stats:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to get lead stats',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get discovery sessions for the authenticated user
   */
  async getDiscoverySessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const sessions = await leadService.getDiscoverySessions(userId);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      logger.error('Error getting discovery sessions:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to get discovery sessions',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get unsaved leads from a discovery session
   */
  async getSessionUnsavedLeads(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { sessionId } = req.params;
      if (!sessionId) {
        res.status(400).json({ success: false, error: 'Session ID is required' });
        return;
      }

      const leads = await leadService.getUnsavedLeadsFromSession(userId, sessionId);

      res.json({
        success: true,
        data: leads,
      });
    } catch (error) {
      logger.error('Error getting session unsaved leads:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to get session leads',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get keyword suggestions
   */
  async suggestKeywords(req: Request, res: Response): Promise<void> {
    try {
      const { keyword, count } = req.body;

      if (!keyword) {
        res.status(400).json({ 
          success: false,
          error: 'Keyword is required' 
        });
        return;
      }

      // Get user's OpenAI API key if available
      const userId = getUserId(req);
      if (userId) {
        const settings = await UserSettings.findOne({ clerkUserId: userId });
        if (settings?.openaiApiKey) {
          openaiService.updateApiKey(settings.openaiApiKey);
        }
      }

      const suggestions = await openaiService.suggestKeywords(keyword, count ?? 10);

      res.json({
        success: true,
        data: {
          keyword,
          suggestions,
        },
      });
    } catch (error) {
      logger.error('Error suggesting keywords:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to generate keyword suggestions',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

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
