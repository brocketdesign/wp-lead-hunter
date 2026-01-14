import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  logLevel: string;

  mongodb: {
    uri: string;
  };

  clerk: {
    secretKey: string;
    publishableKey: string;
  };

  openai: {
    apiKey: string;
  };

  firecrawl: {
    apiKey: string;
  };

  notion: {
    apiKey: string;
    databaseId: string;
  };

  resend: {
    apiKey: string;
    fromEmail: string;
    fromName: string;
  };

  discovery: {
    minDomainAgeMonths: number;
    minTrafficThreshold: number;
  };

  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };

  maxConcurrentRequests: number;
}

const getEnvVarOptional = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

export const config: Config = {
  port: parseInt(getEnvVarOptional('PORT', '3000'), 10),
  nodeEnv: getEnvVarOptional('NODE_ENV', 'development'),
  logLevel: getEnvVarOptional('LOG_LEVEL', 'info'),

  mongodb: {
    uri: getEnvVarOptional('MONGODB_URI', 'mongodb://localhost:27017/wp-lead-hunter'),
  },

  clerk: {
    secretKey: getEnvVarOptional('CLERK_SECRET_KEY', ''),
    publishableKey: getEnvVarOptional('VITE_CLERK_PUBLISHABLE_KEY', ''),
  },

  openai: {
    apiKey: getEnvVarOptional('OPENAI_API_KEY', ''),
  },

  firecrawl: {
    apiKey: getEnvVarOptional('FIRECRAWL_API_KEY', ''),
  },

  notion: {
    apiKey: getEnvVarOptional('NOTION_API_KEY', ''),
    databaseId: getEnvVarOptional('NOTION_DATABASE_ID', ''),
  },

  resend: {
    apiKey: getEnvVarOptional('RESEND_API_KEY', ''),
    fromEmail: getEnvVarOptional('RESEND_FROM_EMAIL', 'onboarding@resend.dev'),
    fromName: getEnvVarOptional('RESEND_FROM_NAME', 'WP Lead Hunter'),
  },

  discovery: {
    minDomainAgeMonths: parseInt(getEnvVarOptional('MIN_DOMAIN_AGE_MONTHS', '6'), 10),
    minTrafficThreshold: parseInt(getEnvVarOptional('MIN_TRAFFIC_THRESHOLD', '1000'), 10),
  },

  rateLimit: {
    windowMs: parseInt(getEnvVarOptional('RATE_LIMIT_WINDOW_MS', '60000'), 10),
    maxRequests: parseInt(getEnvVarOptional('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  },

  maxConcurrentRequests: parseInt(getEnvVarOptional('MAX_CONCURRENT_REQUESTS', '5'), 10),
};

export default config;
