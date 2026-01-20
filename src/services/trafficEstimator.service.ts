import axios from 'axios';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';

const TRAFFIC_PER_PAGE_ESTIMATE = 50; // Estimated traffic per page in sitemap

export interface TrafficInfo {
  traffic?: number;
  domainAge?: number;
  globalRank?: number;
  countryRank?: number;
  estimatedVisits?: number;
  monthlyVisits?: number;
}

export class TrafficEstimatorService {
  /**
   * Get traffic information from seoreviewtools API
   */
  async getTrafficInfoFromSeoreviewtools(
    url: string,
    apiKey: string
  ): Promise<TrafficInfo | null> {
    try {
      const response = await axios.get('https://www.seoreviewtools.com/api/traffic/', {
        params: {
          key: apiKey,
          url: url,
        },
        timeout: 10000,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 200 && response.data) {
        const data = response.data;
        
        // Extract traffic information from API response
        // The API response structure may vary, so we'll handle common fields
        const trafficInfo: TrafficInfo = {};

        // Try to extract monthly visits/traffic
        if (data.monthly_visits !== undefined) {
          trafficInfo.monthlyVisits = parseInt(String(data.monthly_visits), 10);
          trafficInfo.traffic = trafficInfo.monthlyVisits;
        } else if (data.estimated_visits !== undefined) {
          trafficInfo.estimatedVisits = parseInt(String(data.estimated_visits), 10);
          trafficInfo.traffic = trafficInfo.estimatedVisits;
        } else if (data.traffic !== undefined) {
          trafficInfo.traffic = parseInt(String(data.traffic), 10);
        }

        // Extract domain age
        if (data.domain_age !== undefined) {
          trafficInfo.domainAge = parseInt(String(data.domain_age), 10);
        } else if (data.domainAge !== undefined) {
          trafficInfo.domainAge = parseInt(String(data.domainAge), 10);
        }

        // Extract ranking information
        if (data.global_rank !== undefined) {
          trafficInfo.globalRank = parseInt(String(data.global_rank), 10);
        } else if (data.globalRank !== undefined) {
          trafficInfo.globalRank = parseInt(String(data.globalRank), 10);
        }

        if (data.country_rank !== undefined) {
          trafficInfo.countryRank = parseInt(String(data.country_rank), 10);
        } else if (data.countryRank !== undefined) {
          trafficInfo.countryRank = parseInt(String(data.countryRank), 10);
        }

        logger.debug(`Retrieved traffic info from seoreviewtools for ${url}:`, trafficInfo);
        return trafficInfo;
      } else {
        logger.warn(`Seoreviewtools API returned status ${response.status} for ${url}`);
        return null;
      }
    } catch (error) {
      logger.error(`Error fetching traffic info from seoreviewtools for ${url}:`, {
        error: getErrorMessage(error),
      });
      return null;
    }
  }

  async estimateTraffic(domain: string, seoreviewtoolsApiKey?: string): Promise<number | null> {
    try {
      // If seoreviewtools API key is provided, try to use it first
      if (seoreviewtoolsApiKey) {
        try {
          const url = domain.startsWith('http') ? domain : `https://${domain}`;
          const trafficInfo = await this.getTrafficInfoFromSeoreviewtools(url, seoreviewtoolsApiKey);
          if (trafficInfo?.traffic) {
            return trafficInfo.traffic;
          }
        } catch (error) {
          logger.debug(`Seoreviewtools API failed for ${domain}, falling back to public signals`, {
            error: getErrorMessage(error),
          });
        }
      }

      // Fallback to public signals estimation
      return await this.estimateFromPublicSignals(domain);
    } catch (error) {
      logger.error(`Error estimating traffic for ${domain}:`, { error: getErrorMessage(error) });
      return null;
    }
  }

  private async estimateFromPublicSignals(domain: string): Promise<number | null> {
    try {
      // Check Alexa rank (if available) or other public signals
      // This is a placeholder - in production, use proper APIs

      // Try to fetch robots.txt and sitemap to estimate content size
      const sitemapUrl = `https://${domain}/sitemap.xml`;
      const response = await axios
        .get(sitemapUrl, {
          timeout: 5000,
          validateStatus: (status) => status < 500,
        })
        .catch(() => null);

      if (response?.data) {
        // Count URLs in sitemap as a rough indicator
        const urlCount = (response.data.match(/<loc>/g) || []).length;
        // Rough estimate: assume each page gets some traffic
        const estimatedTraffic = urlCount * TRAFFIC_PER_PAGE_ESTIMATE;
        logger.debug(
          `Traffic estimate for ${domain}: ${estimatedTraffic} (based on ${urlCount} pages)`
        );
        return estimatedTraffic;
      }

      // Default moderate traffic if we can't determine
      logger.warn(`Could not estimate traffic for ${domain}, using default`);
      return 500;
    } catch (error) {
      logger.error(`Error in traffic estimation for ${domain}:`, { error: getErrorMessage(error) });
      return null;
    }
  }

  async getTrafficRank(
    domain: string,
    seoreviewtoolsApiKey?: string
  ): Promise<{
    globalRank?: number;
    countryRank?: number;
    estimatedVisits?: number;
  }> {
    // If seoreviewtools API key is provided, use it
    if (seoreviewtoolsApiKey) {
      try {
        const url = domain.startsWith('http') ? domain : `https://${domain}`;
        const trafficInfo = await this.getTrafficInfoFromSeoreviewtools(url, seoreviewtoolsApiKey);
        if (trafficInfo) {
          return {
            globalRank: trafficInfo.globalRank,
            countryRank: trafficInfo.countryRank,
            estimatedVisits: trafficInfo.estimatedVisits || trafficInfo.traffic,
          };
        }
      } catch (error) {
        logger.debug(`Seoreviewtools API failed for ${domain}, using fallback`, {
          error: getErrorMessage(error),
        });
      }
    }

    // Fallback
    return {
      estimatedVisits: (await this.estimateTraffic(domain, seoreviewtoolsApiKey)) || undefined,
    };
  }
}

export default new TrafficEstimatorService();
