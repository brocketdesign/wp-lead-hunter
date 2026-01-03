import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import config from './config';
import logger from './utils/logger';
import routes from './api/routes';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import { rateLimiter } from './api/middleware/rateLimiter';
import { clerkAuth } from './api/middleware/auth';
import { databaseService } from './services/database.service';

class Server {
  private app: Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security - configure helmet to allow Clerk
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdndelivr.net", "https://*.clerk.accounts.dev"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://*.clerk.accounts.dev", "https://api.clerk.dev"],
            frameSrc: ["'self'", "https://*.clerk.accounts.dev"],
          },
        },
      })
    );
    this.app.use(cors());

    // Clerk authentication
    this.app.use(clerkAuth);

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(
      morgan('combined', {
        stream: {
          write: (message: string) => logger.info(message.trim()),
        },
      })
    );

    // Rate limiting
    this.app.use(rateLimiter);
  }

  private setupRoutes(): void {
    // API routes
    this.app.use('/api', routes);

    // Serve static files from frontend build
    const frontendPath = path.join(__dirname, '../dist/frontend');
    this.app.use(express.static(frontendPath));

    // SPA fallback - serve index.html for all non-API routes
    // Express 5 requires named parameter for wildcard
    this.app.get('/{*splat}', (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  private setupErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    const port = config.port;

    // Connect to MongoDB
    try {
      await databaseService.connect();
    } catch (error) {
      logger.warn('MongoDB not connected - running without database', { error });
    }

    this.app.listen(port, () => {
      logger.info(`Server started on port ${port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API available at http://localhost:${port}/api`);
      logger.info(`Frontend available at http://localhost:${port}`);
    });
  }

  public getApp(): Application {
    return this.app;
  }
}

// Start server
const server = new Server();
server.start();

export default server;
