import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';

interface SearchResult {
  url: string;
  title: string;
  description: string;
  matchedKeyword?: string; // The keyword that found this result
}

export interface SearchOptions {
  keywords: string[];
  maxResults?: number;
  language?: string; // Language/region code (e.g., 'en', 'de', 'fr', 'es')
  excludeWordPressCom?: boolean; // Exclude *.wordpress.com hosted blogs
  maxPagesPerSearch?: number; // Search multiple pages per keyword (default 1)
}

// Supported languages/regions for search
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', region: 'US' },
  { code: 'de', name: 'German', region: 'DE' },
  { code: 'fr', name: 'French', region: 'FR' },
  { code: 'es', name: 'Spanish', region: 'ES' },
  { code: 'it', name: 'Italian', region: 'IT' },
  { code: 'pt', name: 'Portuguese', region: 'PT' },
  { code: 'nl', name: 'Dutch', region: 'NL' },
  { code: 'pl', name: 'Polish', region: 'PL' },
  { code: 'ru', name: 'Russian', region: 'RU' },
  { code: 'ja', name: 'Japanese', region: 'JP' },
  { code: 'ko', name: 'Korean', region: 'KR' },
  { code: 'zh', name: 'Chinese', region: 'CN' },
  { code: 'ar', name: 'Arabic', region: 'SA' },
  { code: 'hi', name: 'Hindi', region: 'IN' },
  { code: 'tr', name: 'Turkish', region: 'TR' },
  { code: 'sv', name: 'Swedish', region: 'SE' },
  { code: 'da', name: 'Danish', region: 'DK' },
  { code: 'no', name: 'Norwegian', region: 'NO' },
  { code: 'fi', name: 'Finnish', region: 'FI' },
] as const;

export class SearchService {
  private googleApiKey: string | null = null;
  private googleCseId: string | null = null;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || null;
    const cseId = process.env.GOOGLE_CSE_ID || null;
    
    // Only use Google API if both keys are set and CSE_ID is not a placeholder
    if (apiKey && cseId && !cseId.includes('your_') && cseId.length > 10) {
      this.googleApiKey = apiKey;
      this.googleCseId = cseId;
      logger.info('Google Custom Search API configured');
    } else {
      logger.info('Google Custom Search not configured, using DuckDuckGo fallback');
    }
  }

  /**
   * Check if a URL is a wordpress.com hosted blog (not self-hosted)
   */
  private isWordPressComHosted(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      // Match *.wordpress.com domains (hosted blogs, not self-hosted)
      return hostname === 'wordpress.com' || hostname.endsWith('.wordpress.com');
    } catch {
      return false;
    }
  }

  /**
   * Search for WordPress blogs using Google Custom Search API or fallback to scraping
   */
  async searchWordPressBlogs(
    keywordsOrOptions: string[] | SearchOptions,
    maxResultsParam?: number
  ): Promise<SearchResult[]> {
    // Handle both old signature (keywords[], maxResults) and new signature (SearchOptions)
    const options: SearchOptions = Array.isArray(keywordsOrOptions)
      ? { keywords: keywordsOrOptions, maxResults: maxResultsParam }
      : keywordsOrOptions;
    
    const { 
      keywords, 
      maxResults = 20, 
      language, 
      excludeWordPressCom = true, // Default to excluding wordpress.com hosted blogs
      maxPagesPerSearch = 2 // Default to 2 pages of results per search
    } = options;

    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const keyword of keywords) {
      try {
        // Build search query targeting WordPress blogs
        const searchQuery = `${keyword} wordpress blog`;
        
        // Search multiple pages for more comprehensive results
        for (let page = 0; page < maxPagesPerSearch; page++) {
          const startIndex = page * 10; // 10 results per page
          
          let searchResults: SearchResult[];
          
          if (this.googleApiKey && this.googleCseId) {
            searchResults = await this.searchWithGoogleApi(searchQuery, 10, language, startIndex);
          } else {
            searchResults = await this.searchWithScraping(searchQuery, 10, language, page);
          }

          if (searchResults.length === 0) break; // No more results

          for (const result of searchResults) {
            // Skip if already seen
            if (seenUrls.has(result.url)) continue;
            
            // Skip wordpress.com hosted blogs if filter is enabled
            if (excludeWordPressCom && this.isWordPressComHosted(result.url)) {
              logger.debug(`Skipping wordpress.com hosted blog: ${result.url}`);
              continue;
            }
            
            seenUrls.add(result.url);
            results.push({ ...result, matchedKeyword: keyword });
          }
          
          // Stop if we have enough results
          if (results.length >= maxResults) break;
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
    maxResults: number,
    language?: string,
    startIndex: number = 0
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      const params: Record<string, any> = {
        key: this.googleApiKey,
        cx: this.googleCseId,
        q: query,
        num: Math.min(maxResults, 10), // Google API limits to 10 per request
      };
      
      // Add start index for pagination
      if (startIndex > 0) {
        params.start = startIndex + 1; // Google uses 1-based index
      }
      
      // Add language restriction if specified
      if (language) {
        params.lr = `lang_${language}`; // Language restrict
        params.hl = language; // Interface language
        // Find the region for this language
        const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === language);
        if (langConfig) {
          params.gl = langConfig.region; // Geolocation
        }
      }
      
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params,
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
    } catch (error: any) {
      // Log detailed error for Google API issues
      const errorDetails = error.response?.data?.error || error.response?.data || error.message;
      logger.error('Google Custom Search API error:', { 
        error: getErrorMessage(error),
        details: errorDetails,
        status: error.response?.status,
      });
      // Fall back to scraping if API fails
      return this.searchWithScraping(query, maxResults, language, Math.floor(startIndex / 10));
    }

    return results;
  }

  /**
   * Search using web scraping (fallback when no API key)
   * Uses DuckDuckGo HTML search which doesn't require API keys
   */
  private async searchWithScraping(
    query: string,
    maxResults: number,
    language?: string,
    page: number = 0
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      // Build DuckDuckGo search URL with region parameter
      let searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      // Add page offset for DuckDuckGo (s=start parameter)
      if (page > 0) {
        searchUrl += `&s=${page * 30}`; // DuckDuckGo uses 30 results offset
      }
      
      // Add region parameter for DuckDuckGo
      if (language) {
        const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === language);
        if (langConfig) {
          // DuckDuckGo uses region codes like 'de-de', 'fr-fr', etc.
          searchUrl += `&kl=${language}-${langConfig.region.toLowerCase()}`;
        }
      }
      
      // Set Accept-Language header based on selected language
      const acceptLang = language ? `${language},en;q=0.5` : 'en-US,en;q=0.5';
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': acceptLang,
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
        const alternativeResults = await this.searchWithBing(query, maxResults, language);
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
    maxResults: number,
    language?: string
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      // Build Bing search URL with language/market parameter
      let searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
      
      // Add market parameter for Bing (e.g., 'de-DE', 'fr-FR')
      if (language) {
        const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === language);
        if (langConfig) {
          searchUrl += `&mkt=${language}-${langConfig.region}`;
        }
      }
      
      // Set Accept-Language header based on selected language
      const acceptLang = language ? `${language},en;q=0.5` : 'en-US,en;q=0.9';
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': acceptLang,
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
