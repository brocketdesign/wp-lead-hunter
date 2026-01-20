import { Router } from 'express';
import excludedUrlController from '../controllers/excludedUrl.controller';

const router = Router();

// Get all excluded URLs for current user
router.get('/', excludedUrlController.getExcludedUrls.bind(excludedUrlController));

// Get excluded domains as simple array
router.get('/domains', excludedUrlController.getExcludedDomains.bind(excludedUrlController));

// Add a single excluded URL
router.post('/', excludedUrlController.addExcludedUrl.bind(excludedUrlController));

// Add multiple excluded URLs
router.post('/bulk', excludedUrlController.addMultipleExcludedUrls.bind(excludedUrlController));

// Update an excluded URL
router.put('/:id', excludedUrlController.updateExcludedUrl.bind(excludedUrlController));

// Delete a single excluded URL
router.delete('/:id', excludedUrlController.deleteExcludedUrl.bind(excludedUrlController));

// Clear all excluded URLs for current user
router.delete('/', excludedUrlController.clearExcludedUrls.bind(excludedUrlController));

export default router;
