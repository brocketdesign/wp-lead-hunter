import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import config from './config';
import logger from './utils/logger';
import routes from './api/routes';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import { rateLimiter } from './api/middleware/rateLimiter';

class Server {
  private app: Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());
    this.app.use(cors());

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

    // Root endpoint
    this.app.get('/', (_req, res) => {
      res.json({
        name: 'WP Lead Hunter API',
        version: '1.0.0',
        description: 'Production-grade WordPress lead discovery and outreach platform',
        endpoints: {
          health: '/api/health',
          leads: '/api/leads',
          emails: '/api/emails',
        },
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  public start(): void {
    const port = config.port;

    this.app.listen(port, () => {
      logger.info(`Server started on port ${port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API available at http://localhost:${port}/api`);
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
