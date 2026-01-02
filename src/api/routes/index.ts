import { Router } from 'express';
import leadRoutes from './lead.routes';
import emailRoutes from './email.routes';

const router = Router();

router.use('/leads', leadRoutes);
router.use('/emails', emailRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
