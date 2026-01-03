import { Request, Response, NextFunction, RequestHandler } from 'express';
import { clerkMiddleware, getAuth, requireAuth } from '@clerk/express';
import logger from '../../utils/logger';

// Extend Express Request type to include auth
declare global {
  namespace Express {
    interface Request {
      userAuth?: {
        userId: string | null;
        sessionId: string | null;
      };
    }
  }
}

// Make Clerk middleware optional: if publishable/secret keys are missing, use a no-op middleware
const hasClerkKeys = !!(
  process.env.CLERK_SECRET_KEY ||
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.VITE_CLERK_PUBLISHABLE_KEY
);

if (!hasClerkKeys) {
  logger.warn('Clerk keys not found — running without Clerk middleware');
}

// Initialize Clerk middleware inside try/catch to avoid crashing the server if the
// library throws during initialization (e.g., missing/invalid keys). We explicitly
// pass the publishable key (pick from common env var names) so the library doesn't
// fail if it expects `CLERK_PUBLISHABLE_KEY` specifically.
let _clerkAuth: RequestHandler = (_req, _res, next) => next();
const publishableKey = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const secretKey = process.env.CLERK_SECRET_KEY || '';

// Ensure fallback env var is set so third-party libs that read CLERK_PUBLISHABLE_KEY directly work
if (!process.env.CLERK_PUBLISHABLE_KEY && publishableKey) {
  process.env.CLERK_PUBLISHABLE_KEY = publishableKey;
}

try {
  if (hasClerkKeys) {
    if (!publishableKey) {
      logger.warn('Clerk publishable key missing — skipping Clerk middleware initialization; set CLERK_PUBLISHABLE_KEY or VITE_CLERK_PUBLISHABLE_KEY');
    } else {
      // Pass options if clerkMiddleware supports them; cast to any to avoid TS errors
      _clerkAuth = (clerkMiddleware as any)({ publishableKey, secretKey });
      logger.info('Clerk middleware initialized with provided publishable key (redacted)');
    }
  }
} catch (err: any) {
  logger.error('Failed to initialize Clerk middleware, falling back to no-op', { message: err?.message || String(err), stack: err?.stack });
}

export const clerkAuth: RequestHandler = (req, res, next) => {
  try {
    // Call the Clerk middleware but intercept any errors passed to next(err)
    _clerkAuth(req, res, (err?: any) => {
      if (err) {
        logger.warn('Clerk middleware error at request time - continuing without Clerk', { error: err?.message || err });
        return next();
      }
      return next();
    });
  } catch (err: any) {
    logger.warn('Clerk middleware threw synchronously - continuing without Clerk', { error: err?.message || err });
    return next();
  }
};

// Middleware to require authentication — provide a safe fallback when Clerk isn't configured
let _requireAuth: RequestHandler = (_req, res) => {
  res.status(501).json({ success: false, error: 'Authentication not configured' });
};
try {
  if (hasClerkKeys && publishableKey) {
    _requireAuth = requireAuth() as RequestHandler;
  } else if (hasClerkKeys) {
    logger.warn('Clerk publishable key missing — requireAuth fallback will be used');
  }
} catch (err: any) {
  logger.error('Failed to initialize Clerk requireAuth, using fallback', { message: err?.message || String(err), stack: err?.stack });
}

export const requireAuthentication: RequestHandler = _requireAuth;

// Get user ID from request
export const getUserId = (req: Request): string | null => {
  const auth = getAuth(req);
  return auth?.userId || null;
};

// Optional auth - doesn't block but attaches user info if available
export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const auth = getAuth(req);
    // Store parsed user info on `req.userAuth` to avoid clobbering Clerk's internal `req.auth` function
    req.userAuth = {
      userId: auth?.userId || null,
      sessionId: auth?.sessionId || null,
    };
    next();
  } catch {
    req.userAuth = { userId: null, sessionId: null };
    next();
  }
};

// Protected route middleware
export const protectedRoute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = getAuth(req);
    
    if (!auth?.userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized - Please sign in',
      });
      return;
    }

    req.userAuth = {
      userId: auth.userId,
      sessionId: auth.sessionId || null,
    };
    
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

export default {
  clerkAuth,
  requireAuthentication,
  protectedRoute,
  optionalAuth,
  getUserId,
};
