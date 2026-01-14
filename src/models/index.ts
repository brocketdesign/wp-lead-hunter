export { UserSettings, IUserSettings } from './UserSettings';
export { Lead, ILead } from './Lead';
export { DiscoverySession, IDiscoverySession, IDiscoveredLead } from './DiscoverySession';
export { DiscoveryAgent, IDiscoveryAgent, IDiscoveredBlog } from './DiscoveryAgent';
export { ScrapedUrl, IScrapedUrl } from './ScrapedUrl';
export { 
  EmailTemplate, 
  IEmailTemplate, 
  EmailTemplateCategory,
  DEFAULT_EMAIL_TEMPLATES,
  seedDefaultTemplates,
  getTemplatesByCategory,
  getTemplateCategoryCounts,
} from './EmailTemplate';
