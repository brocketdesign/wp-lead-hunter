import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';

interface SearchResult {
  url: string;
  title: string;
  description: string;
}

export class SearchService {
  private googleApiKey: string | null = null;
  private googleCseId: string | null = null;

  constructor() {
    this.googleApiKey = process.env.GOOGLE_API_KEY || null;
    this.googleCseId = process.env.GOOGLE_CSE_ID || null;
  }

  /**
   * Search for WordPress blogs using Google Custom Search API or fallback to scraping
   */
  async searchWordPressBlogs(
    keywords: string[],
    maxResults: number = 20
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const keyword of keywords) {
      try {
        // Build search query targeting WordPress blogs
        const searchQuery = `${keyword} wordpress blog`;
        
        let searchResults: SearchResult[];
        
        if (this.googleApiKey && this.googleCseId) {
          searchResults = await this.searchWithGoogleApi(searchQuery, maxResults);
        } else {
          searchResults = await this.searchWithScraping(searchQuery, maxResults);
        }

        for (const result of searchResults) {
          if (!seenUrls.has(result.url)) {
            seenUrls.add(result.url);
            results.push(result);
          }
        }
      } catch (error) {
        logger.error(`Error searching for keyword "${keyword}":`, { 
          error: getErrorMessage(error) 
        });
      }
    }

    return results.slice(0, maxResults);
  }

  /**
   * Search using Google Custom Search API (recommended for production)
   */
  private async searchWithGoogleApi(
    query: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: this.googleApiKey,
          cx: this.googleCseId,
          q: query,
          num: Math.min(maxResults, 10), // Google API limits to 10 per request
        },
        timeout: 15000,
      });

      const items = response.data.items || [];
      
      for (const item of items) {
        results.push({
          url: item.link,
          title: item.title || '',
          description: item.snippet || '',
        });
      }

      logger.debug(`Google API search for "${query}" returned ${results.length} results`);
    } catch (error) {
      logger.error('Google Custom Search API error:', { error: getErrorMessage(error) });
      // Fall back to scraping if API fails
      return this.searchWithScraping(query, maxResults);
    }

    return results;
  }

  /**
   * Search using web scraping (fallback when no API key)
   * Uses DuckDuckGo HTML search which doesn't require API keys
   */
  private async searchWithScraping(
    query: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      // Use DuckDuckGo HTML version which is more scraping-friendly
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      const $ = cheerio.load(response.data);
      
      // Parse DuckDuckGo results
      $('.result').each((_index, element) => {
        if (results.length >= maxResults) return;
        
        const $element = $(element);
        const link = $element.find('.result__a').attr('href');
        const title = $element.find('.result__a').text().trim();
        const description = $element.find('.result__snippet').text().trim();

        if (link) {
          // DuckDuckGo wraps URLs, extract actual URL
          const urlMatch = link.match(/uddg=([^&]+)/);
          const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : link;
          
          // Skip non-http URLs and tracking/ad URLs
          if (actualUrl.startsWith('http') && !actualUrl.includes('duckduckgo.com')) {
            results.push({
              url: actualUrl,
              title: title || '',
              description: description || '',
            });
          }
        }
      });

      logger.debug(`Scraping search for "${query}" returned ${results.length} results`);
    } catch (error) {
      logger.error('Scraping search error:', { error: getErrorMessage(error) });
      
      // Try alternative search method
      try {
        const alternativeResults = await this.searchWithBing(query, maxResults);
        return alternativeResults;
      } catch (altError) {
        logger.error('Alternative search also failed:', { error: getErrorMessage(altError) });
      }
    }

    return results;
  }

  /**
   * Alternative scraping using Bing
   */
  private async searchWithBing(
    query: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const $ = cheerio.load(response.data);
      
      // Parse Bing results
      $('li.b_algo').each((_index, element) => {
        if (results.length >= maxResults) return;
        
        const $element = $(element);
        const linkElement = $element.find('h2 a');
        const url = linkElement.attr('href');
        const title = linkElement.text().trim();
        const description = $element.find('.b_caption p').text().trim();

        if (url && url.startsWith('http')) {
          results.push({
            url,
            title: title || '',
            description: description || '',
          });
        }
      });

      logger.debug(`Bing search for "${query}" returned ${results.length} results`);
    } catch (error) {
      logger.error('Bing search error:', { error: getErrorMessage(error) });
    }

    return results;
  }

  /**
   * Search for specific types of WordPress content
   */
  async searchWordPressByCategory(
    category: string,
    niche: string,
    maxResults: number = 20
  ): Promise<SearchResult[]> {
    const queries = [
      `${niche} ${category} wordpress blog`,
      `${niche} blog powered by wordpress`,
      `best ${niche} wordpress blogs`,
      `${niche} bloggers wordpress`,
    ];

    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      const results = await this.searchWordPressBlogs([query], Math.ceil(maxResults / queries.length));
      
      for (const result of results) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }
    }

    return allResults.slice(0, maxResults);
  }
}

export default new SearchService();
