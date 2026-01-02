import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';

export class WordPressDetectorService {
  async isWordPressSite(url: string): Promise<boolean> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WP-Lead-Hunter/1.0)',
        },
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Check for common WordPress indicators
      const indicators = [
        // Meta generator tag
        $('meta[name="generator"]').attr('content')?.includes('WordPress'),

        // WordPress CSS/JS files
        html.includes('/wp-content/'),
        html.includes('/wp-includes/'),
        html.includes('wp-json'),

        // WordPress classes
        $('body').hasClass('wp-site') || $('body').attr('class')?.includes('wordpress'),

        // Link tags
        $('link[rel="https://api.w.org/"]').length > 0,

        // RSS feeds
        $('link[type="application/rss+xml"]').attr('href')?.includes('feed'),
      ];

      const isWP = indicators.filter(Boolean).length >= 2;

      logger.debug(`WordPress detection for ${url}: ${isWP}`, {
        indicators: indicators.filter(Boolean).length,
      });

      return isWP;
    } catch (error) {
      logger.error(`Error detecting WordPress for ${url}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async extractMetadata(url: string): Promise<{
    title?: string;
    description?: string;
    email?: string;
  }> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WP-Lead-Hunter/1.0)',
        },
      });

      const $ = cheerio.load(response.data);

      // Extract title
      const title = $('title').text() || $('meta[property="og:title"]').attr('content');

      // Extract description
      const description =
        $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content');

      // Try to find email
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const bodyText = $('body').text();
      const emails = bodyText.match(emailRegex);
      const email = emails?.[0];

      return { title, description, email };
    } catch (error) {
      logger.error(`Error extracting metadata from ${url}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }
}

export default new WordPressDetectorService();
