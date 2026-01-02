import { Router } from 'express';
import emailController from '../controllers/email.controller';

const router = Router();

// Email sending
router.post('/send', emailController.sendEmail.bind(emailController));

// Template management
router.post('/templates', emailController.createTemplate.bind(emailController));
router.get('/templates', emailController.getTemplates.bind(emailController));
router.get('/templates/:id', emailController.getTemplate.bind(emailController));
router.put('/templates/:id', emailController.updateTemplate.bind(emailController));
router.delete('/templates/:id', emailController.deleteTemplate.bind(emailController));

export default router;
