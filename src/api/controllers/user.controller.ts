import { Request, Response } from 'express';
import { UserSettings } from '../../models';
import { getUserId } from '../middleware/auth';
import logger from '../../utils/logger';

export class UserController {
  // Get user settings
  async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      let settings = await UserSettings.findOne({ clerkUserId: userId });
      
      if (!settings) {
        // Create default settings for new user
        settings = new UserSettings({
          clerkUserId: userId,
        });
        await settings.save();
      }

      // Return masked settings
      res.json({
        success: true,
        data: {
          hasOpenaiKey: !!settings.openaiApiKey,
          hasNotionKey: !!settings.notionApiKey,
          notionDatabaseId: settings.notionDatabaseId || '',
          openaiKeyPreview: settings.openaiApiKey 
            ? settings.openaiApiKey.slice(0, 7) + '...' + settings.openaiApiKey.slice(-4)
            : '',
          notionKeyPreview: settings.notionApiKey
            ? settings.notionApiKey.slice(0, 7) + '...' + settings.notionApiKey.slice(-4)
            : '',
          // Email templates status
          emailTemplatesInitialized: settings.emailTemplatesInitialized || false,
          emailTemplatesInitializedAt: settings.emailTemplatesInitializedAt || null,
        },
      });
    } catch (error) {
      logger.error('Failed to get user settings', { message: (error as Error)?.message || String(error), stack: (error as Error)?.stack, error });
      res.status(500).json({ success: false, error: 'Failed to get settings' });
    }
  }

  // Update user settings
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { openaiApiKey, notionApiKey, notionDatabaseId } = req.body;

      const updateData: Record<string, string> = {};
      
      // Only update fields that are provided
      if (openaiApiKey !== undefined) {
        updateData.openaiApiKey = openaiApiKey;
      }
      if (notionApiKey !== undefined) {
        updateData.notionApiKey = notionApiKey;
      }
      if (notionDatabaseId !== undefined) {
        updateData.notionDatabaseId = notionDatabaseId;
      }

      const settings = await UserSettings.findOneAndUpdate(
        { clerkUserId: userId },
        { $set: updateData },
        { new: true, upsert: true }
      );

      logger.info('User settings updated', { userId });

      res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          hasOpenaiKey: !!settings.openaiApiKey,
          hasNotionKey: !!settings.notionApiKey,
          notionDatabaseId: settings.notionDatabaseId || '',
        },
      });
    } catch (error) {
      logger.error('Failed to update user settings', { message: (error as Error)?.message || String(error), stack: (error as Error)?.stack, error });
      res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
  }

  // Validate API keys
  async validateKeys(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const settings = await UserSettings.findOne({ clerkUserId: userId });
      
      if (!settings) {
        res.json({
          success: true,
          data: { openaiValid: false, notionValid: false },
        });
        return;
      }

      // Basic validation - in production, actually test the APIs
      const openaiValid = !!(settings.openaiApiKey && settings.openaiApiKey.startsWith('sk-'));
      const notionValid = !!(settings.notionApiKey && settings.notionDatabaseId);

      res.json({
        success: true,
        data: { openaiValid, notionValid },
      });
    } catch (error) {
      logger.error('Failed to validate keys', { message: (error as Error)?.message || String(error), stack: (error as Error)?.stack, error });
      res.status(500).json({ success: false, error: 'Failed to validate keys' });
    }
  }

  // Delete user settings (for account cleanup)
  async deleteSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      await UserSettings.findOneAndDelete({ clerkUserId: userId });
      
      logger.info('User settings deleted', { userId });

      res.json({
        success: true,
        message: 'Settings deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete user settings', { message: (error as Error)?.message || String(error), stack: (error as Error)?.stack, error });
      res.status(500).json({ success: false, error: 'Failed to delete settings' });
    }
  }
}

export const userController = new UserController();
export default userController;
