import OpenAI from 'openai';
import { z } from 'zod';
import config from '../config';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';
import { Lead, EmailTemplate } from '../types';

// Zod schema for blog classification structured output
const BlogClassificationSchema = z.object({
  isPersonalBlog: z.boolean().describe('True if this appears to be a personal or indie blog run by an individual or small team'),
  isCorporateSite: z.boolean().describe('True if this appears to be a corporate website, news outlet, or large business site'),
  blogType: z.enum(['personal', 'indie', 'corporate', 'unknown']).describe('Classification: personal (individual blogger), indie (small team/independent), corporate (big company/news), unknown'),
  confidence: z.number().min(0).max(100).describe('Confidence score 0-100 for this classification'),
  reasoning: z.string().describe('Brief explanation of why this classification was made'),
  niche: z.string().optional().describe('The blog niche/topic if identifiable (e.g., travel, food, tech, lifestyle)'),
  estimatedAudience: z.string().optional().describe('Estimated target audience description'),
  isGoodCollaborationTarget: z.boolean().describe('True if this blogger would be a good target for collaboration outreach'),
  collaborationPotentialReason: z.string().describe('Why this is or is not a good collaboration target'),
});

export type BlogClassification = z.infer<typeof BlogClassificationSchema>;

export class OpenAIService {
  private client: OpenAI | null = null;

  constructor() {
    if (config.openai.apiKey) {
      this.client = new OpenAI({ apiKey: config.openai.apiKey });
    } else {
      logger.warn('OpenAI API key not configured. Email generation will be limited.');
    }
  }

  async generatePersonalizedEmail(
    lead: Lead,
    template?: EmailTemplate
  ): Promise<{ subject: string; body: string }> {
    if (!this.client) {
      return this.generateFallbackEmail(lead, template);
    }

    try {
      const prompt = this.buildPrompt(lead, template);

      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are a professional email copywriter specializing in outreach emails for blog partnerships and collaborations. Write personalized, engaging emails that are professional yet friendly.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content || '';
      return this.parseEmailContent(content);
    } catch (error) {
      logger.error('Error generating email with OpenAI:', { error: getErrorMessage(error) });
      return this.generateFallbackEmail(lead, template);
    }
  }

  private buildPrompt(lead: Lead, template?: EmailTemplate): string {
    if (template) {
      return `Generate a personalized outreach email based on this template:
      
Subject: ${template.subject}
Body Template: ${template.bodyTemplate}

Personalize it for:
- Blog: ${lead.title || lead.domain}
- URL: ${lead.url}
- Description: ${lead.description || 'WordPress blog'}
${lead.contactName ? `- Contact: ${lead.contactName}` : ''}

Make it engaging and professional. Return in format:
SUBJECT: [subject line]
BODY:
[email body]`;
    }

    return `Generate a professional outreach email for a WordPress blog partnership opportunity.

Target Blog Information:
- Name: ${lead.title || lead.domain}
- URL: ${lead.url}
- Description: ${lead.description || 'WordPress blog'}
${lead.contactName ? `- Contact Name: ${lead.contactName}` : ''}

Create a personalized email that:
1. Introduces our service/partnership opportunity
2. Mentions something specific about their blog
3. Proposes value for collaboration
4. Has a clear call-to-action

Return in format:
SUBJECT: [subject line]
BODY:
[email body]`;
  }

  private parseEmailContent(content: string): { subject: string; body: string } {
    const subjectMatch = content.match(/SUBJECT:\s*(.+)/i);
    const bodyMatch = content.match(/BODY:\s*([\s\S]+)/i);

    return {
      subject: subjectMatch?.[1]?.trim() || 'Partnership Opportunity',
      body: bodyMatch?.[1]?.trim() || content,
    };
  }

  private generateFallbackEmail(
    lead: Lead,
    template?: EmailTemplate
  ): { subject: string; body: string } {
    const blogName = lead.title || lead.domain;
    const contactName = lead.contactName || 'there';

    if (template) {
      // Simple variable replacement
      let subject = template.subject.replace('{{blogName}}', blogName);
      let body = template.bodyTemplate
        .replace('{{contactName}}', contactName)
        .replace('{{blogName}}', blogName)
        .replace('{{url}}', lead.url);

      return { subject, body };
    }

    return {
      subject: `Partnership Opportunity with ${blogName}`,
      body: `Hi ${contactName},

I came across ${blogName} (${lead.url}) and was impressed by your content.

I wanted to reach out to explore potential collaboration opportunities that could be mutually beneficial.

Would you be open to a brief conversation about this?

Best regards`,
    };
  }

  async analyzeBlogContent(content: string): Promise<{
    topics: string[];
    tone: string;
    targetAudience: string;
  }> {
    if (!this.client) {
      return {
        topics: [],
        tone: 'professional',
        targetAudience: 'general',
      };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Analyze blog content and extract key characteristics.',
          },
          {
            role: 'user',
            content: `Analyze this blog content and return JSON with: topics (array), tone (string), targetAudience (string)\n\n${content.substring(0, 2000)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      try {
        const result = JSON.parse(response.choices[0]?.message?.content || '{}');
        return {
          topics: result.topics || [],
          tone: result.tone || 'professional',
          targetAudience: result.targetAudience || 'general',
        };
      } catch (parseError) {
        logger.error('Error parsing OpenAI response:', { error: getErrorMessage(parseError) });
        return {
          topics: [],
          tone: 'professional',
          targetAudience: 'general',
        };
      }
    } catch (error) {
      logger.error('Error analyzing blog content:', { error: getErrorMessage(error) });
      return {
        topics: [],
        tone: 'professional',
        targetAudience: 'general',
      };
    }
  }

  /**
   * Generate related keyword suggestions using OpenAI
   */
  async suggestKeywords(
    keyword: string,
    count: number = 10
  ): Promise<string[]> {
    if (!this.client) {
      return this.generateFallbackKeywords(keyword);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a keyword research expert specializing in finding WordPress blogs. 
            Generate related keywords that would help find WordPress blogs in a specific niche.
            Focus on variations, related topics, and long-tail keywords that bloggers might target.
            Return ONLY a JSON array of strings, nothing else.`,
          },
          {
            role: 'user',
            content: `Generate ${count} related keyword variations for finding WordPress blogs about: "${keyword}"
            
Include:
- Direct variations (e.g., "travel blog" -> "travel blogs", "travel blogger")
- Related sub-niches (e.g., "travel blog" -> "budget travel blog", "luxury travel blog")
- Long-tail keywords (e.g., "travel blog" -> "solo female travel blog", "family travel tips blog")
- Related topics (e.g., "travel blog" -> "adventure blog", "wanderlust blog")

Return ONLY a JSON array of strings like: ["keyword1", "keyword2", ...]`,
          },
        ],
        temperature: 0.8,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content || '[]';
      
      try {
        // Try to parse as JSON
        const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
        const suggestions = JSON.parse(cleanContent);
        
        if (Array.isArray(suggestions)) {
          return suggestions.filter((s): s is string => typeof s === 'string').slice(0, count);
        }
      } catch (parseError) {
        // If JSON parsing fails, try to extract keywords from text
        const matches = content.match(/"([^"]+)"/g);
        if (matches) {
          return matches.map(m => m.replace(/"/g, '')).slice(0, count);
        }
      }

      return this.generateFallbackKeywords(keyword);
    } catch (error) {
      logger.error('Error generating keyword suggestions:', { error: getErrorMessage(error) });
      return this.generateFallbackKeywords(keyword);
    }
  }

  /**
   * Generate fallback keywords without OpenAI
   */
  private generateFallbackKeywords(keyword: string): string[] {
    const baseKeyword = keyword.toLowerCase().trim();
    
    // Generate basic variations
    const variations = [
      `${baseKeyword} blog`,
      `${baseKeyword} blogger`,
      `${baseKeyword} blogs`,
      `best ${baseKeyword} blog`,
      `top ${baseKeyword} blogs`,
      `${baseKeyword} wordpress`,
      `${baseKeyword} tips blog`,
      `${baseKeyword} guide blog`,
      `${baseKeyword} expert blog`,
      `${baseKeyword} news blog`,
    ];

    return variations.slice(0, 10);
  }

  /**
   * Classify a blog/website using structured JSON output to determine if it's a personal blog
   * good for collaboration vs a corporate/news site that should be filtered out
   */
  async classifyBlog(data: {
    url: string;
    title: string;
    description?: string;
    domain: string;
  }): Promise<BlogClassification> {
    const defaultResult: BlogClassification = {
      isPersonalBlog: false,
      isCorporateSite: false,
      blogType: 'unknown',
      confidence: 0,
      reasoning: 'Unable to classify - OpenAI not available',
      isGoodCollaborationTarget: false,
      collaborationPotentialReason: 'Could not analyze',
    };

    if (!this.client) {
      return defaultResult;
    }

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing websites and blogs to classify them. Your job is to determine if a website is:
1. A personal blog run by an individual blogger who might be interested in collaborations
2. An indie blog run by a small team that actively creates content
3. A corporate website, news outlet, or large business that would NOT be appropriate for individual outreach

We want to find bloggers who:
- Maintain their blog regularly
- Have a personal/authentic voice
- Would be open to collaboration opportunities
- Are NOT large corporations, news sites, or e-commerce platforms

Look for clues in the domain name, title, and description to make your classification.
Examples of GOOD targets: personal travel blogs, food bloggers, lifestyle bloggers, niche hobby blogs, individual tech reviewers
Examples of BAD targets: CNN, Forbes, Amazon, large news outlets, corporate marketing sites, government sites, university sites

IMPORTANT: Respond with a valid JSON object matching this schema:
{
  "isPersonalBlog": boolean,
  "isCorporateSite": boolean,
  "blogType": "personal" | "indie" | "corporate" | "unknown",
  "confidence": number (0-100),
  "reasoning": string,
  "niche": string (optional),
  "estimatedAudience": string (optional),
  "isGoodCollaborationTarget": boolean,
  "collaborationPotentialReason": string
}`,
          },
          {
            role: 'user',
            content: `Classify this website:
URL: ${data.url}
Domain: ${data.domain}
Title: ${data.title}
Description: ${data.description || 'No description available'}

Determine if this is a personal/indie blog good for collaboration or a corporate/large site to filter out.
Respond with ONLY a valid JSON object.`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      const result = content ? BlogClassificationSchema.safeParse(JSON.parse(content)) : null;
      
      if (result?.success) {
        logger.debug(`Blog classified: ${data.url}`, { 
          blogType: result.data.blogType, 
          confidence: result.data.confidence,
          isGoodTarget: result.data.isGoodCollaborationTarget 
        });
        return result.data;
      }

      return defaultResult;
    } catch (error) {
      logger.error('Error classifying blog:', { error: getErrorMessage(error), url: data.url });
      return defaultResult;
    }
  }

  /**
   * Batch classify multiple blogs for efficiency
   */
  async classifyBlogsParallel(blogs: Array<{
    url: string;
    title: string;
    description?: string;
    domain: string;
  }>): Promise<Map<string, BlogClassification>> {
    const results = new Map<string, BlogClassification>();
    
    // Process in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < blogs.length; i += batchSize) {
      const batch = blogs.slice(i, i + batchSize);
      const promises = batch.map(blog => 
        this.classifyBlog(blog).then(classification => ({ url: blog.url, classification }))
      );
      
      const batchResults = await Promise.all(promises);
      for (const { url, classification } of batchResults) {
        results.set(url, classification);
      }
    }
    
    return results;
  }

  /**
   * Update the OpenAI client with a new API key (for user-specific keys)
   */
  updateApiKey(apiKey: string): void {
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      logger.info('OpenAI client updated with new API key');
    }
  }
}

export default new OpenAIService();
