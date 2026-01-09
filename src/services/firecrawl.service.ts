import Firecrawl from '@mendable/firecrawl-js';
import { z } from 'zod';
import config from '../config';
import logger from '../utils/logger';
import { DiscoveryAgent, IDiscoveredBlog } from '../models/DiscoveryAgent';

// Schema for the Firecrawl agent response
const BlogResultSchema = z.object({
  blogs: z.array(
    z.object({
      blog_name: z.string(),
      blog_name_citation: z.string().optional(),
      url: z.string(),
      url_citation: z.string().optional(),
      contact_email: z.string().optional(),
      contact_email_citation: z.string().optional(),
      contact_form_link: z.string().optional(),
      contact_form_link_citation: z.string().optional(),
      platform: z.string().optional(),
      platform_citation: z.string().optional(),
      topics: z.string().optional(),
      topics_citation: z.string().optional(),
      monthly_unique_users_approx: z.string().optional(),
      monthly_unique_users_approx_citation: z.string().optional(),
      has_profile_page: z.boolean().optional(),
      has_profile_page_citation: z.string().optional(),
    })
  ),
});

export class FirecrawlService {
  private client: Firecrawl | null = null;

  constructor() {
    if (config.firecrawl.apiKey) {
      this.client = new Firecrawl({ apiKey: config.firecrawl.apiKey });
      logger.info('Firecrawl client configured');
    } else {
      logger.warn('Firecrawl API key not configured. Agent discovery will not work.');
    }
  }

  /**
   * Initialize client with user's API key
   */
  initWithApiKey(apiKey: string): void {
    this.client = new Firecrawl({ apiKey });
  }

  /**
   * Check if Firecrawl is configured
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Run a discovery agent with the given prompt
   */
  async runAgent(agentId: string, prompt: string): Promise<IDiscoveredBlog[]> {
    if (!this.client) {
      throw new Error('Firecrawl client not configured');
    }

    // Update agent status to running
    await DiscoveryAgent.findByIdAndUpdate(agentId, { status: 'running' });

    try {
      logger.info(`Running Firecrawl agent for: ${agentId}`);

      // Firecrawl client may expect a plain object or a zod schema from a different zod version; cast to any to avoid type mismatch
      const result: any = await this.client.agent({
        prompt,
        schema: BlogResultSchema as any,
      });

      logger.info(`Firecrawl agent completed for: ${agentId}`, { resultCount: result?.blogs?.length || 0 });

      const blogs: IDiscoveredBlog[] = (result?.blogs as IDiscoveredBlog[]) || [];

      // Update agent with results
      await DiscoveryAgent.findByIdAndUpdate(agentId, {
        status: 'completed',
        results: blogs,
        completedAt: new Date(),
      });

      return blogs;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Firecrawl agent failed for: ${agentId}`, { error: errorMessage });

      // Update agent with error
      await DiscoveryAgent.findByIdAndUpdate(agentId, {
        status: 'failed',
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Run agent in background (fire and forget)
   */
  runAgentAsync(agentId: string, prompt: string): void {
    this.runAgent(agentId, prompt).catch((error) => {
      logger.error(`Background agent execution failed for: ${agentId}`, { error });
    });
  }
}

export const firecrawlService = new FirecrawlService();
export default firecrawlService;
