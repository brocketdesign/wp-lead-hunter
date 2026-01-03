import { Router } from 'express';
import leadRoutes from './lead.routes';
import emailRoutes from './email.routes';
import userRoutes from './user.routes';

const router = Router();

router.use('/leads', leadRoutes);
router.use('/emails', emailRoutes);
router.use('/user', userRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Development-only diagnostics for auth configuration
router.get('/_diag/auth', (_req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.json({
    clerkConfigured: !!(
      process.env.CLERK_SECRET_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.VITE_CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ),
    publishableKeyPresent: !!(
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.VITE_CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ),
    secretKeyPresent: !!process.env.CLERK_SECRET_KEY,
  });
});

export default router;
