import Firecrawl from '@mendable/firecrawl-js';
import { z } from 'zod';
import config from '../config';
import logger from '../utils/logger';
import { DiscoveryAgent, IDiscoveredBlog } from '../models/DiscoveryAgent';
import { ScrapedUrl } from '../models';

// Schema for the Firecrawl agent response
const BlogResultSchema = z.array(
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
);

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

      // Use the agent method with the improved prompt
      const result: any = await this.client.agent({
        prompt,
        schema: BlogResultSchema as any,
      });

      logger.info(`Firecrawl agent raw result for: ${agentId}`, { rawResult: JSON.stringify(result, null, 2) });
      logger.info(`Firecrawl agent completed for: ${agentId}`, { resultCount: Array.isArray(result) ? result.length : 0 });

      let blogs: IDiscoveredBlog[] = [];

      // Handle different possible response formats
      if (Array.isArray(result)) {
        blogs = result as IDiscoveredBlog[];
      } else if (result?.blogs && Array.isArray(result.blogs)) {
        blogs = result.blogs as IDiscoveredBlog[];
      } else if (result?.data && Array.isArray(result.data)) {
        // Some APIs wrap results in a data field
        blogs = result.data as IDiscoveredBlog[];
      } else {
        logger.warn(`Unexpected Firecrawl response format for agent ${agentId}`, { resultKeys: Object.keys(result || {}), resultType: typeof result });
      }

      logger.info(`Parsed ${blogs.length} blogs for agent ${agentId}`);

      // Log each blog for debugging
      blogs.forEach((blog, index) => {
        logger.info(`Blog ${index + 1}:`, {
          blog_name: blog.blog_name,
          url: blog.url,
          contact_email: blog.contact_email,
          topics: blog.topics
        });
      });

      // Get agent to get clerkUserId
      const agent = await DiscoveryAgent.findById(agentId);
      const clerkUserId = agent?.clerkUserId;

      // Save all URLs to the ScrapedUrl collection
      if (blogs.length > 0) {
        try {
          const urlSaves = blogs.map(blog => {
            return ScrapedUrl.findOneAndUpdate(
              { url: blog.url },
              {
                url: blog.url,
                agentId: agentId,
                clerkUserId: clerkUserId,
                scrapedAt: new Date(),
              },
              { upsert: true, new: true }
            );
          });
          await Promise.allSettled(urlSaves);
          logger.info(`Saved ${blogs.length} URLs to ScrapedUrl collection`);
        } catch (error) {
          logger.error(`Error saving URLs to ScrapedUrl collection:`, { error });
          // Don't fail the whole operation if URL saving fails
        }
      }

      // Update agent with results
      const updateResult = await DiscoveryAgent.findByIdAndUpdate(agentId, {
        status: 'completed',
        results: blogs,
        completedAt: new Date(),
      });

      logger.info(`Updated agent ${agentId} in database:`, { updateResult: !!updateResult, resultsCount: blogs.length });

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
