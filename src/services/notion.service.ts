import { Client } from '@notionhq/client';
import config from '../config';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';
import { Lead } from '../types';

export class NotionService {
  private client: Client | null = null;
  private databaseId: string;

  constructor() {
    if (config.notion.apiKey) {
      this.client = new Client({ auth: config.notion.apiKey });
      this.databaseId = config.notion.databaseId;
    } else {
      logger.warn('Notion API key not configured. Sync will be disabled.');
      this.databaseId = '';
    }
  }

  async syncLead(lead: Lead): Promise<string | null> {
    if (!this.client || !this.databaseId) {
      logger.warn('Notion not configured, skipping sync');
      return null;
    }

    try {
      if (lead.notionPageId) {
        // Update existing page
        await this.updatePage(lead);
        return lead.notionPageId;
      } else {
        // Create new page
        const pageId = await this.createPage(lead);
        return pageId;
      }
    } catch (error) {
      logger.error(`Error syncing lead ${lead.id} to Notion:`, { error: getErrorMessage(error) });
      return null;
    }
  }

  private async createPage(lead: Lead): Promise<string> {
    if (!this.client) throw new Error('Notion client not initialized');

    const response = await this.client.pages.create({
      parent: { database_id: this.databaseId },
      properties: this.buildProperties(lead),
    });

    logger.info(`Created Notion page for lead ${lead.id}: ${response.id}`);
    return response.id;
  }

  private async updatePage(lead: Lead): Promise<void> {
    if (!this.client || !lead.notionPageId) return;

    await this.client.pages.update({
      page_id: lead.notionPageId,
      properties: this.buildProperties(lead),
    });

    logger.info(`Updated Notion page for lead ${lead.id}`);
  }

  private buildProperties(lead: Lead): any {
    return {
      Name: {
        title: [
          {
            text: {
              content: lead.title || lead.domain,
            },
          },
        ],
      },
      URL: {
        url: lead.url,
      },
      Domain: {
        rich_text: [
          {
            text: {
              content: lead.domain,
            },
          },
        ],
      },
      Status: {
        select: {
          name: lead.status,
        },
      },
      Email: {
        email: lead.email || null,
      },
      Traffic: {
        number: lead.traffic || null,
      },
      'Domain Age': {
        number: lead.domainAge || null,
      },
      'Is WordPress': {
        checkbox: lead.isWordPress,
      },
      'Is Qualified': {
        checkbox: lead.isQualified,
      },
      'Qualification Score': {
        number: lead.qualificationScore || null,
      },
      'Outreach Attempts': {
        number: lead.outreachAttempts,
      },
      Tags: {
        multi_select: lead.tags.map((tag) => ({ name: tag })),
      },
      Notes: {
        rich_text: lead.notes
          ? [
              {
                text: {
                  content: lead.notes.substring(0, 2000), // Notion has limits
                },
              },
            ]
          : [],
      },
    };
  }

  async syncEvent(leadId: string, eventType: string, eventData: any): Promise<void> {
    if (!this.client) return;

    try {
      // Log event as a page comment or in a separate events database
      logger.info(`Event sync for lead ${leadId}: ${eventType}`, eventData);

      // You could create a separate events database or add comments
      // For now, we'll just log it
    } catch (error) {
      logger.error(`Error syncing event for lead ${leadId}:`, { error: getErrorMessage(error) });
    }
  }

  async createDatabase(): Promise<string | null> {
    if (!this.client) {
      logger.error('Notion client not initialized');
      return null;
    }

    try {
      // This requires the parent page ID - typically done manually first
      logger.info('Database creation should be done manually in Notion first');
      return null;
    } catch (error) {
      logger.error('Error creating Notion database:', { error: getErrorMessage(error) });
      return null;
    }
  }

  async batchSyncLeads(leads: Lead[]): Promise<void> {
    if (!this.client) return;

    logger.info(`Batch syncing ${leads.length} leads to Notion`);

    for (const lead of leads) {
      await this.syncLead(lead);
      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    logger.info('Batch sync completed');
  }
}

export default new NotionService();
