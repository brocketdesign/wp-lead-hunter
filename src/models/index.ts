export { UserSettings, IUserSettings } from './UserSettings';
export { Lead, ILead } from './Lead';
export { DiscoverySession, IDiscoverySession, IDiscoveredLead } from './DiscoverySession';
export { 
  EmailTemplate, 
  IEmailTemplate, 
  EmailTemplateCategory,
  DEFAULT_EMAIL_TEMPLATES,
  seedDefaultTemplates,
  getTemplatesByCategory,
  getTemplateCategoryCounts,
} from './EmailTemplate';
