import Firecrawl from '@mendable/firecrawl-js';
import { z } from 'zod';
import config from '../config';
import logger from '../utils/logger';
import { DiscoveryAgent, IDiscoveredBlog } from '../models/DiscoveryAgent';
import { ScrapedUrl, UserSettings } from '../models';
import trafficEstimatorService from './trafficEstimator.service';

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

      // Get user's seoreviewtools API key if available
      let seoreviewtoolsApiKey: string | undefined;
      if (clerkUserId) {
        try {
          const userSettings = await UserSettings.findOne({ clerkUserId });
          if (userSettings?.seoreviewtoolsApiKey) {
            seoreviewtoolsApiKey = userSettings.seoreviewtoolsApiKey;
            logger.info(`Found seoreviewtools API key for user ${clerkUserId}, will fetch traffic info`);
          }
        } catch (error) {
          logger.warn(`Error fetching user settings for traffic info:`, { error });
        }
      }

      // Fetch traffic information for each blog if API key is available
      if (seoreviewtoolsApiKey && blogs.length > 0) {
        logger.info(`Fetching traffic information for ${blogs.length} blogs using seoreviewtools API`);
        
        // Process blogs in parallel with rate limiting (batch of 5 at a time)
        const batchSize = 5;
        for (let i = 0; i < blogs.length; i += batchSize) {
          const batch = blogs.slice(i, i + batchSize);
          const trafficPromises = batch.map(async (blog) => {
            try {
              if (!blog.url) {
                return;
              }

              const trafficInfo = await trafficEstimatorService.getTrafficInfoFromSeoreviewtools(
                blog.url,
                seoreviewtoolsApiKey!
              );

              if (trafficInfo) {
                blog.traffic = trafficInfo.traffic || trafficInfo.monthlyVisits || trafficInfo.estimatedVisits;
                blog.domainAge = trafficInfo.domainAge;
                blog.globalRank = trafficInfo.globalRank;
                blog.countryRank = trafficInfo.countryRank;
                blog.monthlyVisits = trafficInfo.monthlyVisits || trafficInfo.traffic;

                logger.debug(`Added traffic info for ${blog.url}:`, {
                  traffic: blog.traffic,
                  domainAge: blog.domainAge,
                  globalRank: blog.globalRank,
                });
              }
            } catch (error) {
              logger.warn(`Error fetching traffic info for ${blog.url}:`, { error });
              // Continue processing other blogs even if one fails
            }
          });

          await Promise.allSettled(trafficPromises);
          
          // Small delay between batches to avoid rate limiting
          if (i + batchSize < blogs.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        logger.info(`Completed fetching traffic information for blogs`);
      } else if (blogs.length > 0) {
        logger.info(`No seoreviewtools API key found, skipping traffic info fetch`);
      }

      // Save all URLs to the ScrapedUrl collection
      if (blogs.length > 0 && clerkUserId) {
        try {
          const urlSaves = blogs.map(async (blog) => {
            if (!blog.url) {
              logger.warn('Blog entry missing URL, skipping ScrapedUrl save');
              return null;
            }

            try {
              // Normalize URL (remove trailing slash, lowercase domain, etc.)
              const normalizedUrl = this.normalizeUrl(blog.url);
              
              // Use update with upsert to create new entry or update existing one
              // This tracks when the URL was most recently scraped and by which agent
              return ScrapedUrl.findOneAndUpdate(
                { url: normalizedUrl },
                {
                  url: normalizedUrl,
                  agentId: agentId,
                  clerkUserId: clerkUserId,
                  scrapedAt: new Date(), // Update to latest scrape time
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
            } catch (urlError) {
              // Handle duplicate key errors gracefully
              if ((urlError as any)?.code === 11000) {
                logger.debug(`URL already exists in ScrapedUrl collection: ${blog.url}`);
                return null;
              }
              throw urlError;
            }
          });

          const results = await Promise.allSettled(urlSaves);
          const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
          const failed = results.filter(r => r.status === 'rejected').length;

          logger.info(`Saved ${successful} URLs to ScrapedUrl collection`, {
            total: blogs.length,
            successful,
            failed,
            skipped: blogs.length - successful - failed,
          });
        } catch (error) {
          logger.error(`Error saving URLs to ScrapedUrl collection:`, { 
            error: error instanceof Error ? error.message : error 
          });
          // Don't fail the whole operation if URL saving fails
        }
      } else if (blogs.length > 0 && !clerkUserId) {
        logger.warn(`Cannot save URLs to ScrapedUrl collection: agent ${agentId} has no clerkUserId`);
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
   * Normalize URL for consistent storage
   * Removes trailing slashes, converts to lowercase for domain, etc.
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Normalize the path (remove trailing slash except for root)
      let path = urlObj.pathname;
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      
      // Reconstruct URL with normalized path
      return `${urlObj.protocol}//${urlObj.host.toLowerCase()}${path}${urlObj.search}${urlObj.hash}`;
    } catch (error) {
      // If URL parsing fails, return as-is
      logger.warn(`Failed to normalize URL: ${url}`, { error });
      return url;
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
