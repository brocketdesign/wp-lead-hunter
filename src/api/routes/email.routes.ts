import { Router } from 'express';
import emailController from '../controllers/email.controller';

const router = Router();

// Email sending
router.post('/send', emailController.sendEmail.bind(emailController));
router.post('/send-with-resend', emailController.sendEmailWithResend.bind(emailController));
router.post('/send-bulk', emailController.sendBulkEmails.bind(emailController));

// Generate email with AI
router.post('/generate', emailController.generateEmail.bind(emailController));

// Get available languages for email generation
router.get('/languages', emailController.getLanguages.bind(emailController));

// Initialize default templates for user
router.post('/templates/initialize', emailController.initializeTemplates.bind(emailController));

// Template management (in-memory - legacy)
router.post('/templates', emailController.createTemplate.bind(emailController));
router.get('/templates', emailController.getTemplates.bind(emailController));
router.get('/templates/:id', emailController.getTemplate.bind(emailController));
router.put('/templates/:id', emailController.updateTemplate.bind(emailController));
router.delete('/templates/:id', emailController.deleteTemplate.bind(emailController));

// Database-backed template management (with categories)
router.post('/db/templates', emailController.createTemplateInDb.bind(emailController));
router.get('/db/templates', emailController.getAllTemplatesFromDb.bind(emailController));
router.get('/db/templates/categories', emailController.getTemplateCategoryCounts.bind(emailController));
router.get('/db/templates/category/:category', emailController.getTemplatesByCategory.bind(emailController));
router.get('/db/templates/search', emailController.searchTemplates.bind(emailController));
router.get('/db/templates/:id', emailController.getTemplateFromDb.bind(emailController));
router.put('/db/templates/:id', emailController.updateTemplateInDb.bind(emailController));
router.delete('/db/templates/:id', emailController.deleteTemplateFromDb.bind(emailController));
router.post('/db/templates/:id/duplicate', emailController.duplicateTemplate.bind(emailController));

export default router;
