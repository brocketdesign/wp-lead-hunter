import { Router } from 'express';
import leadController from '../controllers/lead.controller';

const router = Router();

// Lead discovery and management
router.post('/discover', leadController.discoverLead.bind(leadController));
router.get('/', leadController.getLeads.bind(leadController));
router.get('/:id', leadController.getLead.bind(leadController));
router.put('/:id', leadController.updateLead.bind(leadController));
router.delete('/:id', leadController.deleteLead.bind(leadController));

// Notion sync
router.post('/sync/notion', leadController.syncToNotion.bind(leadController));

export default router;
