import { Request, Response } from 'express';
import OpenAI from 'openai';
import { DiscoveryAgent, UserSettings } from '../../models';
import firecrawlService from '../../services/firecrawl.service';
import logger from '../../utils/logger';
import { getErrorMessage } from '../../utils/helpers';
import config from '../../config';
import { getUserId } from '../middleware/auth';

export class AgentController {
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

The prompt should:
1. Specify the exact niche/topic in the user's target language
2. Describe the type of blog owners to target (individuals, small teams)
3. Include specific search terms in the target language
4. Specify what information to extract (blog name, URL, contact email, contact form link, topics)
5. Include criteria for filtering (platform=WordPress, language-specific content)
6. Be detailed enough to find quality results

For the agent name: Create a concise, descriptive name (max 50 chars) that captures the search focus.
For the agent description: Create a brief description (max 100 chars) explaining what this agent does.

Return ONLY valid JSON with this structure:
{
  "prompt": "the detailed search prompt",
  "name": "Agent Name",
  "description": "Brief description of what this agent does"
}`;

      const userMessage = `Generate a Firecrawl agent configuration for finding WordPress blogs with these criteria:
- Niche/Topic: ${niche}
- Language: ${language || 'English'}
- Platform: ${platform || 'WordPress'}
- Target Audience: ${targetAudience || 'Personal bloggers and small teams'}
${additionalRequirements ? `- Additional Requirements: ${additionalRequirements}` : ''}

Create a JSON response with:
1. prompt: Detailed Firecrawl agent prompt to find blogs in this niche that use WordPress, extract blog name, URL, contact email, contact form link, topics, prioritize sites with clear contact information, focus on individual bloggers or small teams, not corporate sites
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
      const { name, description, firecrawlPrompt, startImmediately = true } = req.body;

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
        firecrawlService.runAgentAsync(agent._id.toString(), firecrawlPrompt);
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

      // Reset agent status and results
      agent.status = 'pending';
      agent.results = [];
      agent.error = undefined;
      agent.completedAt = undefined;
      await agent.save();

      // Initialize Firecrawl and run
      firecrawlService.initWithApiKey(firecrawlApiKey);
      firecrawlService.runAgentAsync(agent._id.toString(), agent.firecrawlPrompt);

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
}

export const agentController = new AgentController();
export default agentController;
