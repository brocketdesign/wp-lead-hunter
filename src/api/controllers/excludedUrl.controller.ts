import { Request, Response } from 'express';
import ExcludedUrl from '../../models/ExcludedUrl';
import { logger } from '../../utils/logger';
import { getUserId } from '../middleware/auth';

class ExcludedUrlController {
  /**
   * Get all excluded URLs for the current user
   */
  async getExcludedUrls(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);

      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const excludedUrls = await ExcludedUrl.find({ clerkUserId }).sort({ addedAt: -1 });

      res.json({
        success: true,
        data: excludedUrls,
        count: excludedUrls.length,
      });
    } catch (error) {
      logger.error('Error fetching excluded URLs:', error);
      res.status(500).json({
        error: 'Failed to fetch excluded URLs',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get all excluded URLs as a simple array of domains (for filtering)
   */
  async getExcludedDomains(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);

      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const excludedUrls = await ExcludedUrl.find({ clerkUserId }).select('domain');
      const domains = excludedUrls.map(item => item.domain);

      res.json({
        success: true,
        data: domains,
      });
    } catch (error) {
      logger.error('Error fetching excluded domains:', error);
      res.status(500).json({
        error: 'Failed to fetch excluded domains',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Add a new URL to the exclusion list
   */
  async addExcludedUrl(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);

      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { url, reason } = req.body;

      if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
      }

      // Extract domain from URL
      let domain: string;
      try {
        const urlObj = new URL(url);
        domain = urlObj.hostname.replace(/^www\./, '');
      } catch (e) {
        res.status(400).json({ error: 'Invalid URL format' });
        return;
      }

      // Check if already excluded
      const existing = await ExcludedUrl.findOne({ clerkUserId, domain });
      if (existing) {
        res.status(400).json({ error: 'This domain is already in your exclusion list' });
        return;
      }

      const excludedUrl = new ExcludedUrl({
        clerkUserId,
        url,
        domain,
        reason: reason || '',
      });

      await excludedUrl.save();

      res.status(201).json({
        success: true,
        data: excludedUrl,
      });
    } catch (error) {
      logger.error('Error adding excluded URL:', error);
      res.status(500).json({
        error: 'Failed to add excluded URL',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Add multiple URLs to the exclusion list
   */
  async addMultipleExcludedUrls(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);

      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { urls } = req.body;

      if (!Array.isArray(urls) || urls.length === 0) {
        res.status(400).json({ error: 'URLs array is required' });
        return;
      }

      const results = {
        added: [] as any[],
        skipped: [] as string[],
        errors: [] as string[],
      };

      for (const urlEntry of urls) {
        const url = typeof urlEntry === 'string' ? urlEntry : urlEntry.url;
        const reason = typeof urlEntry === 'object' ? urlEntry.reason : '';

        try {
          // Extract domain from URL
          const urlObj = new URL(url);
          const domain = urlObj.hostname.replace(/^www\./, '');

          // Check if already excluded
          const existing = await ExcludedUrl.findOne({ clerkUserId, domain });
          if (existing) {
            results.skipped.push(domain);
            continue;
          }

          const excludedUrl = new ExcludedUrl({
            clerkUserId,
            url,
            domain,
            reason: reason || '',
          });

          await excludedUrl.save();
          results.added.push(excludedUrl);
        } catch (e) {
          results.errors.push(url);
        }
      }

      res.status(201).json({
        success: true,
        data: results,
        message: `Added ${results.added.length} URLs, skipped ${results.skipped.length} duplicates, ${results.errors.length} errors`,
      });
    } catch (error) {
      logger.error('Error adding multiple excluded URLs:', error);
      res.status(500).json({
        error: 'Failed to add excluded URLs',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update an excluded URL (mainly for updating the reason)
   */
  async updateExcludedUrl(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      const { id } = req.params;
      const { reason } = req.body;

      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const excludedUrl = await ExcludedUrl.findOne({ _id: id, clerkUserId });

      if (!excludedUrl) {
        res.status(404).json({ error: 'Excluded URL not found' });
        return;
      }

      if (reason !== undefined) {
        excludedUrl.reason = reason;
      }

      await excludedUrl.save();

      res.json({
        success: true,
        data: excludedUrl,
      });
    } catch (error) {
      logger.error('Error updating excluded URL:', error);
      res.status(500).json({
        error: 'Failed to update excluded URL',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete an excluded URL
   */
  async deleteExcludedUrl(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);
      const { id } = req.params;

      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await ExcludedUrl.deleteOne({ _id: id, clerkUserId });

      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Excluded URL not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Excluded URL deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting excluded URL:', error);
      res.status(500).json({
        error: 'Failed to delete excluded URL',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete all excluded URLs for the current user
   */
  async clearExcludedUrls(req: Request, res: Response): Promise<void> {
    try {
      const clerkUserId = getUserId(req);

      if (!clerkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await ExcludedUrl.deleteMany({ clerkUserId });

      res.json({
        success: true,
        message: `Deleted ${result.deletedCount} excluded URLs`,
        count: result.deletedCount,
      });
    } catch (error) {
      logger.error('Error clearing excluded URLs:', error);
      res.status(500).json({
        error: 'Failed to clear excluded URLs',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export default new ExcludedUrlController();
