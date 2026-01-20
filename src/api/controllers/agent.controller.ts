import { Request, Response } from 'express';
import OpenAI from 'openai';
import { DiscoveryAgent, UserSettings, ScrapedUrl, Lead } from '../../models';
import firecrawlService from '../../services/firecrawl.service';
import logger from '../../utils/logger';
import { getErrorMessage } from '../../utils/helpers';
import config from '../../config';
import { getUserId } from '../middleware/auth';

export class AgentController {
  /**
   * Generate complete agent configuration from a simple user objective/description
   * This is the AI-assisted agent creation feature
   */
  async generateFromObjective(req: Request, res: Response): Promise<void> {
    try {
      const { objective } = req.body;

      if (!objective) {
        res.status(400).json({
          success: false,
          error: 'Objective description is required',
        });
        return;
      }

      // Get user's OpenAI API key
      const userId = getUserId(req);
      let openaiApiKey = config.openai.apiKey;

      if (userId) {
        const settings = await UserSettings.findOne({ clerkUserId: userId });
        if (settings?.openaiApiKey) {
          openaiApiKey = settings.openaiApiKey;
        }
      }

      if (!openaiApiKey) {
        res.status(400).json({
          success: false,
          error: 'OpenAI API key not configured',
        });
        return;
      }

      const client = new OpenAI({ apiKey: openaiApiKey });

      const systemPrompt = `You are an expert at understanding user needs and creating WordPress blog discovery agent configurations.
Given a simple objective or description of what the user is looking for, you need to:
1. Understand their goal and target audience
2. Suggest relevant search keywords (5-10 keywords)
3. Determine the best language for the search
4. Identify the target audience type
5. Generate additional requirements/filters
6. Create an agent name and description

Return a JSON object with:
{
  "analysis": "Brief analysis of the user's objective",
  "suggestedKeywords": ["keyword1", "keyword2", ...],
  "niche": "The main niche/topic",
  "language": "en" | "ja" | "es" | "fr" | "de" | "other",
  "targetAudience": "Personal bloggers and small teams" | "Individual creators" | "Small businesses" | "Professional bloggers",
  "additionalRequirements": "Suggested additional requirements and filters",
  "agentName": "Suggested agent name (max 50 chars)",
  "agentDescription": "Suggested agent description (max 100 chars)"
}`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Analyze this objective and generate a complete agent configuration:\n\n"${objective}"\n\nReturn ONLY valid JSON.` 
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content?.trim() || '{}';
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(content);
      } catch (parseError) {
        logger.error('Failed to parse OpenAI response as JSON:', { content, parseError });
        throw new Error('Invalid response format from OpenAI');
      }

      res.json({
        success: true,
        data: {
          analysis: parsedResponse.analysis || '',
          suggestedKeywords: parsedResponse.suggestedKeywords || [],
          niche: parsedResponse.niche || '',
          language: parsedResponse.language || 'en',
          targetAudience: parsedResponse.targetAudience || 'Personal bloggers and small teams',
          additionalRequirements: parsedResponse.additionalRequirements || '',
          agentName: parsedResponse.agentName || '',
          agentDescription: parsedResponse.agentDescription || '',
        },
      });
    } catch (error) {
      logger.error('Error generating from objective:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to analyze objective',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Generate a Firecrawl prompt using OpenAI based on user's simple inputs
   */
  async generatePrompt(req: Request, res: Response): Promise<void> {
    try {
      const { niche, language, platform, targetAudience, additionalRequirements } = req.body;

      if (!niche) {
        res.status(400).json({
          success: false,
          error: 'Niche is required',
        });
        return;
      }

      // Get user's OpenAI API key
      const userId = getUserId(req);
      let openaiApiKey = config.openai.apiKey;

      if (userId) {
        const settings = await UserSettings.findOne({ clerkUserId: userId });
        if (settings?.openaiApiKey) {
          openaiApiKey = settings.openaiApiKey;
        }
      }

      if (!openaiApiKey) {
        res.status(400).json({
          success: false,
          error: 'OpenAI API key not configured',
        });
        return;
      }

      const client = new OpenAI({ apiKey: openaiApiKey });

      const systemPrompt = `You are an expert at crafting precise search prompts for a web crawling agent that finds WordPress blogs. 
Your task is to generate a detailed, specific prompt that will help find the most relevant blogs, plus create a suitable agent name and description.

The prompt should be structured for an AI web research agent and include:
1. Specific search terms and queries to use
2. What information to extract from each blog found
3. Criteria for filtering and validating blogs
4. Instructions on how to search effectively (use search engines, browse directories, etc.)
5. Be detailed enough to find quality results
6. IMPORTANT: For each potential blog found, the agent MUST check the traffic using this API: http://hatoltd.com/wp-json/api/seo-traffic?domain=[BLOG_DOMAIN] (replace [BLOG_DOMAIN] with the actual domain, e.g., example.com). Include the traffic data in the results.

For the agent name: Create a concise, descriptive name (max 50 chars) that captures the search focus.
For the agent description: Create a brief description (max 100 chars) explaining what this agent does.

Return ONLY valid JSON with this structure:
{
  "prompt": "the detailed search and extraction prompt for the AI agent",
  "name": "Agent Name",
  "description": "Brief description of what this agent does"
}`;

      // Check if user has seoreviewtools API key
      let seoreviewtoolsApiKey = '';
      if (userId) {
        const settings = await UserSettings.findOne({ clerkUserId: userId });
        if (settings?.seoreviewtoolsApiKey) {
          seoreviewtoolsApiKey = settings.seoreviewtoolsApiKey;
        }
      }

      const seoreviewtoolsInstructions = seoreviewtoolsApiKey 
        ? `\n\nIMPORTANT: You have access to the SEOReviewTools API. You can use this API to get detailed SEO and traffic data for websites. The API key is: ${seoreviewtoolsApiKey}. When you find a blog URL, you can use the SEOReviewTools API to get additional information like domain age, traffic estimates, and SEO metrics. Include instructions in the prompt for the agent to use this API when available.`
        : '';

      const userMessage = `Generate a Firecrawl agent configuration for finding WordPress blogs with these criteria:
- Niche/Topic: ${niche}
- Language: ${language || 'English'}
- Platform: ${platform || 'WordPress'}
- Target Audience: ${targetAudience || 'Personal bloggers and small teams'}
${additionalRequirements ? `- Additional Requirements: ${additionalRequirements}` : ''}${seoreviewtoolsInstructions}

Create a JSON response with:
1. prompt: Detailed instructions for an AI web research agent. The agent should: (a) Search for WordPress blogs in the specified niche using search engines and blog directories, (b) Visit promising websites, (c) Extract structured data from each blog including blog name, URL, contact email, contact form link, topics/categories, (d) Only include blogs that are clearly WordPress sites with contact information available, (e) Focus on individual bloggers and small teams, not corporate sites, (f) For EACH blog found, check the traffic by calling this API: http://hatoltd.com/wp-json/api/seo-traffic?domain=[BLOG_DOMAIN] (replace [BLOG_DOMAIN] with the blog's domain like example.com). Include the traffic data (monthly_visits, organic_traffic, etc.) in the results, (g) Return results in the specified JSON format with traffic data included.${seoreviewtoolsApiKey ? ' Additionally, the agent can use the SEOReviewTools API (API key provided below) to get SEO metrics, domain age, and traffic estimates for discovered websites. Include this capability in the prompt.' : ''}
2. name: Concise agent name (max 50 chars) like "Anime Blog Hunter" or "Tech Review Finder"
3. description: Brief description (max 100 chars) like "Discovers Japanese anime blogs for collaboration opportunities"`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content?.trim() || '{}';
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(content);
      } catch (parseError) {
        logger.error('Failed to parse OpenAI response as JSON:', { content, parseError });
        throw new Error('Invalid response format from OpenAI');
      }

      const generatedPrompt = parsedResponse.prompt || '';
      const generatedName = parsedResponse.name || `Agent: ${niche}`;
      const generatedDescription = parsedResponse.description || `Discover WordPress blogs for ${niche}`;

      res.json({
        success: true,
        data: {
          prompt: generatedPrompt,
          name: generatedName,
          description: generatedDescription,
          inputs: { niche, language, platform, targetAudience, additionalRequirements },
        },
      });
    } catch (error) {
      logger.error('Error generating prompt:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to generate prompt',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Create a new discovery agent
   */
  async createAgent(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, firecrawlPrompt, startImmediately = true, avoidScrapingSameUrl = false } = req.body;

      if (!name || !description || !firecrawlPrompt) {
        res.status(400).json({
          success: false,
          error: 'Name, description, and firecrawlPrompt are required',
        });
        return;
      }

      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      // Check for Firecrawl API key
      const settings = await UserSettings.findOne({ clerkUserId: userId });
      const firecrawlApiKey = settings?.firecrawlApiKey || config.firecrawl.apiKey;

      if (!firecrawlApiKey) {
        res.status(400).json({
          success: false,
          error: 'Firecrawl API key not configured. Please add it in Settings.',
        });
        return;
      }

      // Get base URL from request
      const protocol = req.protocol || 'http';
      const host = req.get('host') || `localhost:${config.port}`;
      const baseUrl = `${protocol}://${host}`;
      const scrapedUrlsUrl = `${baseUrl}/api/agents/scraped-urls`;

      // Enhance prompt with seoreviewtools API key if available
      let enhancedPrompt = firecrawlPrompt;
      if (settings?.seoreviewtoolsApiKey) {
        enhancedPrompt = `${firecrawlPrompt}\n\nIMPORTANT: You have access to the SEOReviewTools API to get detailed SEO and traffic data for websites. API Key: ${settings.seoreviewtoolsApiKey}. When you discover a blog URL, you can use the SEOReviewTools API to get additional information like domain age, traffic estimates, and SEO metrics. Use this API to enrich the data you collect about each blog.`;
      }

      // Add URL exclusion list if checkbox is enabled
      if (avoidScrapingSameUrl) {
        enhancedPrompt = `${enhancedPrompt}\n\nIMPORTANT: To avoid scraping URLs that have already been scraped, check the following URL before scraping any website: ${scrapedUrlsUrl}\nThis endpoint returns a JSON object with a "urls" array containing all previously scraped URLs. Before scraping a URL, check if it exists in this list. If it does, skip it and find another URL to scrape.`;
      }

      // Create the agent
      const agent = await DiscoveryAgent.create({
        clerkUserId: userId,
        name,
        description,
        firecrawlPrompt,
        status: startImmediately ? 'pending' : 'pending',
      });

      // If startImmediately, run the agent in background
      if (startImmediately) {
        // Initialize Firecrawl with user's API key
        firecrawlService.initWithApiKey(firecrawlApiKey);
        firecrawlService.runAgentAsync(agent._id.toString(), enhancedPrompt);
      }

      res.status(201).json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error('Error creating agent:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to create agent',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Get all agents for the current user
   */
  async getAgents(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const agents = await DiscoveryAgent.find({ clerkUserId: userId })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        data: agents,
      });
    } catch (error) {
      logger.error('Error fetching agents:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch agents',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Get a single agent by ID
   */
  async getAgent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const agent = await DiscoveryAgent.findOne({
        _id: id,
        clerkUserId: userId,
      }).lean();

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error('Error fetching agent:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch agent',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Delete an agent
   */
  async deleteAgent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const agent = await DiscoveryAgent.findOneAndDelete({
        _id: id,
        clerkUserId: userId,
      });

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Agent deleted successfully' },
      });
    } catch (error) {
      logger.error('Error deleting agent:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to delete agent',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Re-run an agent
   */
  async rerunAgent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const agent = await DiscoveryAgent.findOne({
        _id: id,
        clerkUserId: userId,
      });

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      // Check for Firecrawl API key
      const settings = await UserSettings.findOne({ clerkUserId: userId });
      const firecrawlApiKey = settings?.firecrawlApiKey || config.firecrawl.apiKey;

      if (!firecrawlApiKey) {
        res.status(400).json({
          success: false,
          error: 'Firecrawl API key not configured',
        });
        return;
      }

      // Enhance prompt with seoreviewtools API key if available
      let enhancedPrompt = agent.firecrawlPrompt;
      if (settings?.seoreviewtoolsApiKey) {
        enhancedPrompt = `${agent.firecrawlPrompt}\n\nIMPORTANT: You have access to the SEOReviewTools API to get detailed SEO and traffic data for websites. API Key: ${settings.seoreviewtoolsApiKey}. When you discover a blog URL, you can use the SEOReviewTools API to get additional information like domain age, traffic estimates, and SEO metrics. Use this API to enrich the data you collect about each blog.`;
      }

      // Reset agent status and results
      agent.status = 'pending';
      agent.results = [];
      agent.error = undefined;
      agent.completedAt = undefined;
      await agent.save();

      // Initialize Firecrawl and run
      firecrawlService.initWithApiKey(firecrawlApiKey);
      firecrawlService.runAgentAsync(agent._id.toString(), enhancedPrompt);

      res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error('Error re-running agent:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to re-run agent',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Export agent results as JSON
   */
  async exportResultsJson(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const agent = await DiscoveryAgent.findOne({
        _id: id,
        clerkUserId: userId,
      }).lean();

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="agent-${id}-results.json"`);
      res.json(agent.results || []);
    } catch (error) {
      logger.error('Error exporting JSON:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to export results',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Export agent results as CSV
   */
  async exportResultsCsv(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const agent = await DiscoveryAgent.findOne({
        _id: id,
        clerkUserId: userId,
      }).lean();

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      const results = agent.results || [];
      
      if (results.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No results to export',
        });
        return;
      }

      // Get all unique keys from all results
      const allKeys = new Set<string>();
      results.forEach((result: any) => {
        Object.keys(result).forEach(key => allKeys.add(key));
      });

      const headers = Array.from(allKeys);
      
      // Convert array values to strings
      const escapeCsvValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (Array.isArray(value)) return value.join('; ');
        if (typeof value === 'object') return JSON.stringify(value);
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Build CSV
      const csvRows: string[] = [];
      csvRows.push(headers.map(escapeCsvValue).join(','));
      
      results.forEach((result: any) => {
        const row = headers.map(header => escapeCsvValue(result[header]));
        csvRows.push(row.join(','));
      });

      const csv = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="agent-${id}-results.csv"`);
      res.send(csv);
    } catch (error) {
      logger.error('Error exporting CSV:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to export results',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Get all scraped URLs (public endpoint for Firecrawl)
   */
  async getScrapedUrls(_req: Request, res: Response): Promise<void> {
    try {
      const urls = await ScrapedUrl.find({})
        .select('url scrapedAt')
        .sort({ scrapedAt: -1 })
        .lean();

      // Return simple array of URLs for easy consumption by Firecrawl
      const urlList = urls.map(item => item.url);

      res.json({
        urls: urlList,
        count: urlList.length,
      });
    } catch (error) {
      logger.error('Error fetching scraped URLs:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch scraped URLs',
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * Save firecrawl results as leads
   */
  async saveResultsAsLeads(req: Request, res: Response): Promise<void> {
    try {
      const { agentId, resultIndices } = req.body;
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      if (!agentId) {
        res.status(400).json({
          success: false,
          error: 'Agent ID is required',
        });
        return;
      }

      const agent = await DiscoveryAgent.findOne({
        _id: agentId,
        clerkUserId: userId,
      });

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      const results = agent.results || [];
      const indicesToSave = resultIndices && resultIndices.length > 0 
        ? resultIndices 
        : results.map((_: unknown, idx: number) => idx);

      const savedLeads: any[] = [];
      const errors: string[] = [];

      for (const idx of indicesToSave) {
        const result = results[idx];
        if (!result) {
          errors.push(`Index ${idx} not found in results`);
          continue;
        }

        try {
          // Extract domain from URL
          let domain = '';
          try {
            const urlObj = new URL(result.url);
            domain = urlObj.hostname.replace('www.', '');
          } catch {
            domain = result.url;
          }

          // Check if lead already exists
          const existingLead = await Lead.findOne({
            clerkUserId: userId,
            domain,
          });

          if (existingLead) {
            // Update existing lead
            existingLead.title = result.blog_name || existingLead.title;
            existingLead.email = result.contact_email || existingLead.email;
            existingLead.niche = Array.isArray(result.topics) ? result.topics.join(', ') : (result.topics || existingLead.niche);
            // Update traffic info if available
            if (result.traffic !== undefined) {
              existingLead.traffic = result.traffic;
            }
            if (result.domainAge !== undefined) {
              existingLead.domainAge = result.domainAge;
            }
            await existingLead.save();
            savedLeads.push(existingLead);
          } else {
            // Create new lead from firecrawl result
            const nicheValue = Array.isArray(result.topics) ? result.topics.join(', ') : result.topics;
            const newLead = await Lead.create({
              clerkUserId: userId,
              url: result.url,
              domain,
              title: result.blog_name || domain,
              email: result.contact_email,
              isWordPress: result.platform?.toLowerCase().includes('wordpress') ?? true,
              niche: nicheValue,
              traffic: result.traffic,
              domainAge: result.domainAge,
              status: 'DISCOVERED',
              tags: [],
              source: `Firecrawl Agent: ${agent.name}`,
              discoverySessionId: agentId,
            });
            savedLeads.push(newLead);
          }
        } catch (error: any) {
          if (error.code === 11000) {
            errors.push(`Lead for ${result.url} already exists`);
          } else {
            errors.push(`Error saving ${result.url}: ${error.message}`);
          }
        }
      }

      res.json({
        success: true,
        data: {
          savedCount: savedLeads.length,
          leads: savedLeads,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error) {
      logger.error('Error saving results as leads:', { error: getErrorMessage(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to save results as leads',
        message: getErrorMessage(error),
      });
    }
  }
}

export const agentController = new AgentController();
export default agentController;
