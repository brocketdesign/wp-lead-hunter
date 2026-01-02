import axios from 'axios';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/helpers';

export class DomainAgeService {
  async getDomainAgeInMonths(domain: string): Promise<number | null> {
    try {
      // Using a WHOIS API approach - in production, you might use a dedicated service
      // For now, we'll estimate based on available data
      const response = await axios.get(`https://www.whoisxmlapi.com/whoisserver/WhoisService`, {
        params: {
          apiKey: process.env.WHOIS_API_KEY || 'demo',
          domainName: domain,
          outputFormat: 'JSON',
        },
        timeout: 10000,
      }).catch(() => null);

      if (response?.data?.WhoisRecord?.createdDate) {
        const createdDate = new Date(response.data.WhoisRecord.createdDate);
        const now = new Date();
        const ageInMonths = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return Math.floor(ageInMonths);
      }

      // Fallback: Use a simple heuristic based on Internet Archive or other signals
      logger.warn(`Could not determine domain age for ${domain}, using fallback`);
      return await this.estimateDomainAge(domain);
    } catch (error) {
      logger.error(`Error getting domain age for ${domain}:`, { error: getErrorMessage(error) });
      return null;
    }
  }

  private async estimateDomainAge(domain: string): Promise<number | null> {
    try {
      // Check Internet Archive Wayback Machine for earliest snapshot
      const response = await axios.get(
        `https://archive.org/wayback/available?url=${domain}`,
        { timeout: 10000 }
      );

      if (response.data?.archived_snapshots?.closest?.timestamp) {
        const timestamp = response.data.archived_snapshots.closest.timestamp;
        const year = parseInt(timestamp.substring(0, 4));
        const month = parseInt(timestamp.substring(4, 6));
        const archiveDate = new Date(year, month - 1);
        const now = new Date();
        const ageInMonths = (now.getTime() - archiveDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return Math.floor(ageInMonths);
      }

      return null;
    } catch (error) {
      logger.error(`Error estimating domain age for ${domain}:`, { error: getErrorMessage(error) });
      return null;
    }
  }
}

export default new DomainAgeService();
