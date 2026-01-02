import OpenAI from 'openai';
import config from '../config';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';
import { Lead, EmailTemplate } from '../types';

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

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      return {
        topics: result.topics || [],
        tone: result.tone || 'professional',
        targetAudience: result.targetAudience || 'general',
      };
    } catch (error) {
      logger.error('Error analyzing blog content:', { error: getErrorMessage(error) });
      return {
        topics: [],
        tone: 'professional',
        targetAudience: 'general',
      };
    }
  }
}

export default new OpenAIService();
