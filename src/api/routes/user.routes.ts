import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { protectedRoute } from '../middleware/auth';

const router = Router();

// All user routes require authentication
router.use(protectedRoute);

// Get user settings
router.get('/settings', (req, res) => userController.getSettings(req, res));

// Update user settings
router.put('/settings', (req, res) => userController.updateSettings(req, res));

// Validate API keys
router.get('/settings/validate', (req, res) => userController.validateKeys(req, res));

// Delete user settings
router.delete('/settings', (req, res) => userController.deleteSettings(req, res));

export default router;
