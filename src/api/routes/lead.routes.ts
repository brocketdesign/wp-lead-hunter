import { Router } from 'express';
import leadController from '../controllers/lead.controller';

const router = Router();

// Lead discovery
router.post('/discover', leadController.discoverByKeywords.bind(leadController));
router.post('/discover/url', leadController.discoverLead.bind(leadController));
router.post('/discover/save', leadController.saveDiscoveredLeads.bind(leadController));
router.post('/suggest-keywords', leadController.suggestKeywords.bind(leadController));

// User-specific lead management (requires auth)
router.get('/my', leadController.getUserLeads.bind(leadController));
router.get('/my/stats', leadController.getLeadStats.bind(leadController));
router.get('/my/sessions', leadController.getDiscoverySessions.bind(leadController));

// General lead management (backward compatibility)
router.get('/', leadController.getLeads.bind(leadController));
router.get('/:id', leadController.getLead.bind(leadController));
router.put('/:id', leadController.updateLead.bind(leadController));
router.delete('/:id', leadController.deleteLead.bind(leadController));

// Notion sync
router.post('/sync/notion', leadController.syncToNotion.bind(leadController));

export default router;
