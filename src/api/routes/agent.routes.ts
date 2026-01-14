import { Router } from 'express';
import agentController from '../controllers/agent.controller';

const router = Router();

// Generate a Firecrawl prompt using OpenAI
router.post('/generate-prompt', agentController.generatePrompt.bind(agentController));

// Agent CRUD operations
router.post('/', agentController.createAgent.bind(agentController));
router.get('/', agentController.getAgents.bind(agentController));
router.get('/:id', agentController.getAgent.bind(agentController));
router.delete('/:id', agentController.deleteAgent.bind(agentController));

// Re-run an agent
router.post('/:id/rerun', agentController.rerunAgent.bind(agentController));

// Export agent results
router.get('/:id/export/json', agentController.exportResultsJson.bind(agentController));
router.get('/:id/export/csv', agentController.exportResultsCsv.bind(agentController));

export default router;
