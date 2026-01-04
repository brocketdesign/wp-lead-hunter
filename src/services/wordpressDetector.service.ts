import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';

export interface BlogActivityInfo {
  isActiveBlog: boolean;
  lastPostDate?: Date;
  postFrequency?: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'irregular' | 'inactive';
  estimatedPostsPerMonth?: number;
  recentPostTitles?: string[];
}

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

  /**
   * Check if a WordPress blog is actively maintained by analyzing RSS feed or recent posts
   */
  async checkBlogActivity(url: string): Promise<BlogActivityInfo> {
    const defaultResult: BlogActivityInfo = {
      isActiveBlog: false,
      postFrequency: 'inactive',
    };

    try {
      // Try to fetch the RSS feed first (most reliable for WordPress)
      const feedUrls = [
        `${url.replace(/\/$/, '')}/feed/`,
        `${url.replace(/\/$/, '')}/rss/`,
        `${url.replace(/\/$/, '')}/feed/rss2/`,
      ];

      for (const feedUrl of feedUrls) {
        try {
          const response = await axios.get(feedUrl, {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; WP-Lead-Hunter/1.0)',
              'Accept': 'application/rss+xml, application/xml, text/xml',
            },
          });

          const $ = cheerio.load(response.data, { xmlMode: true });
          const items = $('item');
          
          if (items.length === 0) continue;

          const postDates: Date[] = [];
          const recentPostTitles: string[] = [];

          items.each((index, element) => {
            if (index >= 10) return false; // Only check last 10 posts
            
            const pubDate = $(element).find('pubDate').text();
            const title = $(element).find('title').text();
            
            if (pubDate) {
              const date = new Date(pubDate);
              if (!isNaN(date.getTime())) {
                postDates.push(date);
              }
            }
            if (title && recentPostTitles.length < 5) {
              recentPostTitles.push(title);
            }
            return true; // Continue iteration
          });

          if (postDates.length > 0) {
            const sortedDates = postDates.sort((a, b) => b.getTime() - a.getTime());
            const lastPostDate = sortedDates[0];
            const daysSinceLastPost = Math.floor((Date.now() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24));

            // Calculate posting frequency
            let postFrequency: BlogActivityInfo['postFrequency'] = 'inactive';
            let estimatedPostsPerMonth = 0;

            if (sortedDates.length >= 2) {
              const oldestPost = sortedDates[sortedDates.length - 1];
              const daySpan = Math.max(1, (lastPostDate.getTime() - oldestPost.getTime()) / (1000 * 60 * 60 * 24));
              const postsPerDay = sortedDates.length / daySpan;
              estimatedPostsPerMonth = Math.round(postsPerDay * 30);

              if (postsPerDay >= 0.5) postFrequency = 'daily';
              else if (postsPerDay >= 0.14) postFrequency = 'weekly';
              else if (postsPerDay >= 0.07) postFrequency = 'bi-weekly';
              else if (postsPerDay >= 0.03) postFrequency = 'monthly';
              else postFrequency = 'irregular';
            }

            // Consider active if posted within last 90 days
            const isActiveBlog = daysSinceLastPost <= 90;

            logger.debug(`Blog activity for ${url}:`, {
              lastPostDate,
              daysSinceLastPost,
              postFrequency,
              estimatedPostsPerMonth,
              isActiveBlog,
            });

            return {
              isActiveBlog,
              lastPostDate,
              postFrequency,
              estimatedPostsPerMonth,
              recentPostTitles,
            };
          }
        } catch (feedError) {
          // Continue to next feed URL
          continue;
        }
      }

      // Fallback: try to scrape recent posts from the main page
      return await this.checkActivityFromHomepage(url);
    } catch (error) {
      logger.error(`Error checking blog activity for ${url}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return defaultResult;
    }
  }

  /**
   * Fallback method to check activity from homepage when RSS is not available
   */
  private async checkActivityFromHomepage(url: string): Promise<BlogActivityInfo> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WP-Lead-Hunter/1.0)',
        },
      });

      const $ = cheerio.load(response.data);
      const recentPostTitles: string[] = [];

      // Look for common WordPress post date patterns
      const datePatterns = [
        'time[datetime]',
        '.entry-date',
        '.post-date',
        '.published',
        '.date',
        'meta[property="article:published_time"]',
      ];

      let lastPostDate: Date | undefined;

      for (const pattern of datePatterns) {
        const dateElement = $(pattern).first();
        if (dateElement.length) {
          const dateStr = dateElement.attr('datetime') || 
                         dateElement.attr('content') || 
                         dateElement.text();
          if (dateStr) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              lastPostDate = date;
              break;
            }
          }
        }
      }

      // Extract post titles
      const titleSelectors = ['.entry-title', '.post-title', 'article h2', 'article h3'];
      for (const selector of titleSelectors) {
        $(selector).each((_index, element) => {
          if (recentPostTitles.length < 5) {
            const title = $(element).text().trim();
            if (title) recentPostTitles.push(title);
          }
        });
        if (recentPostTitles.length >= 3) break;
      }

      if (lastPostDate) {
        const daysSinceLastPost = Math.floor((Date.now() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24));
        const isActiveBlog = daysSinceLastPost <= 90;

        return {
          isActiveBlog,
          lastPostDate,
          postFrequency: isActiveBlog ? 'irregular' : 'inactive',
          recentPostTitles,
        };
      }

      // If we found posts but no dates, assume it might be active
      if (recentPostTitles.length > 0) {
        return {
          isActiveBlog: true,
          postFrequency: 'irregular',
          recentPostTitles,
        };
      }

      return {
        isActiveBlog: false,
        postFrequency: 'inactive',
      };
    } catch (error) {
      logger.error(`Error checking homepage activity for ${url}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isActiveBlog: false,
        postFrequency: 'inactive',
      };
    }
  }
}

export default new WordPressDetectorService();
