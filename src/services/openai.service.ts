import OpenAI from 'openai';
import config from '../config';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';
import { Lead, EmailTemplate } from '../types';

// Re-export BlogClassification from search service for backward compatibility
export type { WordPressBlogResult as BlogClassification } from './search.service';

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
    template?: EmailTemplate,
    language?: string,
    customInstructions?: string
  ): Promise<{ subject: string; body: string }> {
    logger.info('Generating personalized email:', { 
      leadUrl: lead.url, 
      hasTemplate: !!template, 
      language, 
      hasCustomInstructions: !!customInstructions,
      customInstructionsPreview: customInstructions?.substring(0, 100)
    });

    if (!this.client) {
      logger.warn('OpenAI client not configured, using fallback');
      return this.generateFallbackEmail(lead, template, language);
    }

    try {
      // First, fetch website information
      logger.info('Fetching website context for:', { url: lead.url });
      let websiteContext = '';
      try {
        websiteContext = await this.fetchWebsiteContext(lead.url);
        logger.info('Website context fetched:', { 
          url: lead.url, 
          contextLength: websiteContext.length,
          hasContext: websiteContext.length > 0 
        });
      } catch (webError) {
        logger.warn('Could not fetch website context:', { error: getErrorMessage(webError) });
      }

      const prompt = this.buildPrompt(lead, template, language, customInstructions, websiteContext);
      
      const languageInstruction = language && language !== 'en' 
        ? `Write the email entirely in ${this.getLanguageName(language)}. ` 
        : '';

      const customInstructionText = customInstructions 
        ? `IMPORTANT - Follow these specific instructions from the user: ${customInstructions}. ` 
        : '';

      const systemContent = `You are a professional email copywriter specializing in outreach emails for blog partnerships and collaborations. ${languageInstruction}${customInstructionText}Write personalized, engaging emails that are professional yet friendly. Use the website context provided to make the email highly relevant and personalized with specific references to their actual content.`;

      logger.info('Calling OpenAI for email generation with context');

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemContent,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || '';
      logger.info('Email generated successfully:', { responseLength: content.length });
      
      return this.parseEmailContent(content);
    } catch (error) {
      logger.error('Error generating email with OpenAI:', { error: getErrorMessage(error) });
      return this.generateFallbackEmail(lead, template, language);
    }
  }

  /**
   * Fetch website content and analyze it with OpenAI
   */
  private async fetchWebsiteContext(url: string): Promise<string> {
    if (!this.client) {
      return '';
    }

    try {
      // First, fetch the website HTML content
      logger.info('Fetching website content for email personalization:', { url });
      
      const websiteContent = await this.scrapeWebsiteContent(url);
      
      if (!websiteContent || websiteContent.length < 100) {
        logger.warn('Could not fetch enough website content:', { url, contentLength: websiteContent?.length });
        return '';
      }

      // Now analyze the content with OpenAI
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing websites and extracting key information for personalized outreach emails.
Analyze the provided website content and extract:
1. What the website/blog is about (main topics, niche)
2. The writing style and tone
3. Target audience
4. Recent blog posts or content themes (if visible)
5. Notable achievements, products, or services
6. Any personal information about the blogger/owner
7. What makes this site unique or interesting

Be specific and provide concrete details that can be used to write a highly personalized email.`,
          },
          {
            role: 'user',
            content: `Analyze this website content from ${url}:\n\n${websiteContent.substring(0, 15000)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const analysis = response.choices[0]?.message?.content || '';
      logger.info('Website analysis completed:', { url, analysisLength: analysis.length });
      
      return analysis;
    } catch (error) {
      logger.warn('Website analysis failed:', { url, error: getErrorMessage(error) });
      return '';
    }
  }

  /**
   * Scrape website content using fetch
   */
  private async scrapeWebsiteContent(url: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn('Website fetch failed:', { url, status: response.status });
        return '';
      }

      const html = await response.text();
      
      // Extract text content from HTML (simple extraction)
      const textContent = this.extractTextFromHtml(html);
      
      return textContent;
    } catch (error) {
      logger.warn('Failed to scrape website:', { url, error: getErrorMessage(error) });
      return '';
    }
  }

  /**
   * Extract readable text from HTML
   */
  private extractTextFromHtml(html: string): string {
    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
    
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract meta description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : '';
    
    // Extract headings
    const headings: string[] = [];
    const headingMatches = text.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
    for (const match of headingMatches) {
      const heading = match[1].replace(/<[^>]+>/g, '').trim();
      if (heading) headings.push(heading);
    }
    
    // Extract paragraph text
    const paragraphs: string[] = [];
    const pMatches = text.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const match of pMatches) {
      const para = match[1].replace(/<[^>]+>/g, '').trim();
      if (para && para.length > 20) paragraphs.push(para);
    }
    
    // Extract article content
    const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    let articleText = '';
    if (articleMatch) {
      articleText = articleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    // Extract main content
    const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    let mainText = '';
    if (mainMatch) {
      mainText = mainMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    // Build the final content
    const parts: string[] = [];
    
    if (title) parts.push(`TITLE: ${title}`);
    if (metaDesc) parts.push(`DESCRIPTION: ${metaDesc}`);
    if (headings.length > 0) parts.push(`HEADINGS:\n${headings.slice(0, 20).join('\n')}`);
    if (articleText) parts.push(`ARTICLE CONTENT:\n${articleText.substring(0, 5000)}`);
    else if (mainText) parts.push(`MAIN CONTENT:\n${mainText.substring(0, 5000)}`);
    if (paragraphs.length > 0) parts.push(`PARAGRAPHS:\n${paragraphs.slice(0, 15).join('\n\n')}`);
    
    return parts.join('\n\n');
  }

  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      en: 'English',
      ja: 'Japanese',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      zh: 'Chinese',
      ko: 'Korean',
      pt: 'Portuguese',
      it: 'Italian',
      ru: 'Russian',
    };
    return languages[code] || 'English';
  }

  private buildPrompt(lead: Lead, template?: EmailTemplate, language?: string, customInstructions?: string, websiteContext?: string): string {
    const languageNote = language && language !== 'en' 
      ? `\n\nIMPORTANT: Write the entire email in ${this.getLanguageName(language)}. The subject and body must be in ${this.getLanguageName(language)}.`
      : '';
    
    const customInstructionsNote = customInstructions 
      ? `\n\nCUSTOM INSTRUCTIONS FROM USER:\n${customInstructions}`
      : '';

    const websiteContextNote = websiteContext 
      ? `\n\nDETAILED WEBSITE ANALYSIS (use this to personalize the email):\n${websiteContext}`
      : '';

    // Build available data object for variable replacement
    const availableData = {
      name: lead.contactName || 'there',
      contact_name: lead.contactName || 'there',
      domain: lead.domain || new URL(lead.url).hostname.replace(/^www\./, ''),
      url: lead.url,
      title: lead.title || lead.domain || 'your blog',
      blog_name: lead.title || lead.domain || 'your blog',
      description: lead.description || '',
      niche: lead.tags?.[0] || 'your niche',
      email: lead.email || '',
      // Placeholder for sender info - user should configure these in settings
      sender_name: '[Your Name]',
      sender_title: '[Your Title]',
      company_name: '[Your Company]',
      // Dynamic placeholders the AI should fill creatively
      recent_topic: '[a recent topic from their blog]',
      specific_compliment: '[something specific about their content]',
      value_proposition: '[your unique value proposition]',
      value_content: '[relevant content or resource]',
      topic: lead.tags?.[0] || lead.title || 'your content',
    };

    if (template) {
      // Pre-replace known variables in the template
      let processedSubject = template.subject;
      let processedBody = template.bodyTemplate;

      // Replace all known variables
      for (const [key, value] of Object.entries(availableData)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        processedSubject = processedSubject.replace(regex, value);
        processedBody = processedBody.replace(regex, value);
      }

      return `Generate a personalized outreach email by completing this template. 
Replace any remaining {{placeholders}} with appropriate content based on the blog information.

TEMPLATE SUBJECT: ${processedSubject}

TEMPLATE BODY:
${processedBody}

BLOG INFORMATION:
- Blog Name: ${availableData.title}
- Domain: ${availableData.domain}
- URL: ${availableData.url}
- Description: ${availableData.description || 'A WordPress blog'}
- Contact Name: ${availableData.name}
- Niche/Topic: ${availableData.niche}
${websiteContextNote}

INSTRUCTIONS:
1. Replace any remaining {{variable}} placeholders with relevant, personalized content
2. Use the detailed website analysis above to make specific, accurate references to their content
3. For {{recent_topic}}, use actual content from the website analysis if available
4. For {{specific_compliment}}, create a genuine compliment based on real details from their site
5. Keep the tone professional but friendly
6. Make sure the email sounds natural and personalized, not templated
7. Keep {{sender_name}}, {{sender_title}}, {{company_name}} as-is if they appear (user will fill these)
${customInstructionsNote}

Return in this exact format:
SUBJECT: [the complete subject line]
BODY:
[the complete email body]${languageNote}`;
    }

    return `Generate a professional outreach email for a WordPress blog partnership opportunity.${languageNote}

Target Blog Information:
- Blog Name: ${availableData.title}
- Domain: ${availableData.domain}
- URL: ${availableData.url}
- Description: ${availableData.description || 'A WordPress blog'}
- Contact Name: ${availableData.name}
- Niche/Topic: ${availableData.niche}
${websiteContextNote}

Create a personalized email that:
1. Addresses them by name if available
2. Uses specific details from the website analysis to mention something real about their blog
3. Explains the value of potential collaboration
4. Has a clear, soft call-to-action
5. Sounds genuine and not like a mass email
${customInstructionsNote}

Return in this exact format:
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
    template?: EmailTemplate,
    _language?: string
  ): { subject: string; body: string } {
    const blogName = lead.title || lead.domain;
    const contactName = lead.contactName || 'there';
    const domain = lead.domain || new URL(lead.url).hostname.replace(/^www\./, '');
    const niche = lead.tags?.[0] || 'your industry';

    // Build replacement map
    const replacements: Record<string, string> = {
      name: contactName,
      contact_name: contactName,
      domain: domain,
      url: lead.url,
      title: blogName,
      blog_name: blogName,
      description: lead.description || '',
      niche: niche,
      email: lead.email || '',
      sender_name: '[Your Name]',
      sender_title: '[Your Title]',
      company_name: '[Your Company]',
      recent_topic: 'your recent content',
      specific_compliment: 'the quality of your content',
      value_proposition: 'potential collaboration opportunities',
      value_content: 'some resources that might interest you',
      topic: niche,
    };

    if (template) {
      let subject = template.subject;
      let body = template.bodyTemplate;

      // Replace all variables
      for (const [key, value] of Object.entries(replacements)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }

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
