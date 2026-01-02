import { Request, Response, NextFunction } from 'express';
import config from '../../config';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export const rateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const key = req.ip || 'unknown';
  const now = Date.now();

  if (!store[key] || now > store[key].resetTime) {
    store[key] = {
      count: 1,
      resetTime: now + config.rateLimit.windowMs,
    };
    next();
    return;
  }

  if (store[key].count >= config.rateLimit.maxRequests) {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((store[key].resetTime - now) / 1000),
    });
    return;
  }

  store[key].count++;
  next();
};
