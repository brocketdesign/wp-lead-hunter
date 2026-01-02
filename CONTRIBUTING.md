# Contributing to WP Lead Hunter

## Code Architecture

This project follows a clean, modular architecture with clear separation of concerns:

```
src/
├── config/              # Configuration management
│   └── index.ts         # Environment-based configuration
├── types/               # TypeScript type definitions
│   └── index.ts         # Core domain types
├── utils/               # Utility functions
│   ├── logger.ts        # Winston logging setup
│   └── helpers.ts       # Helper functions
├── services/            # Business logic layer
│   ├── lead.service.ts           # Lead management
│   ├── email.service.ts          # Email operations
│   ├── openai.service.ts         # OpenAI integration
│   ├── notion.service.ts         # Notion sync
│   ├── wordpressDetector.service.ts  # WP detection
│   ├── domainAge.service.ts      # Domain age checking
│   └── trafficEstimator.service.ts   # Traffic estimation
├── api/                 # HTTP API layer
│   ├── controllers/     # Request handlers
│   ├── routes/          # Route definitions
│   └── middleware/      # Express middleware
└── index.ts            # Application entry point
```

## Design Principles

### 1. Separation of Concerns
- **Services**: Pure business logic, no HTTP concerns
- **Controllers**: Handle HTTP requests/responses, delegate to services
- **Routes**: Define API endpoints
- **Middleware**: Cross-cutting concerns (logging, errors, rate limiting)

### 2. Dependency Injection
All services are instantiated as singletons and exported:

```typescript
export class MyService {
  // Service implementation
}

export default new MyService();
```

This allows:
- Easy testing with mocks
- Clear dependency graph
- Singleton pattern for shared state

### 3. Type Safety
Full TypeScript coverage with strict mode:
- All functions have return type annotations
- No `any` types (warnings only)
- Comprehensive interface definitions

### 4. Configuration Management
All configuration through environment variables:
- No hardcoded values
- Type-safe config object
- Validation on startup

### 5. Error Handling
Centralized error handling:
- Try-catch in all async operations
- Structured error logging
- Safe error serialization (no circular refs)
- User-friendly error messages

## Code Style

### TypeScript
```typescript
// Good: Explicit types, async/await
async function getData(id: string): Promise<Data | null> {
  try {
    const result = await service.get(id);
    return result;
  } catch (error) {
    logger.error('Error getting data:', { error: getErrorMessage(error) });
    return null;
  }
}

// Bad: Any types, promise chains
function getData(id: any) {
  return service.get(id)
    .then(result => result)
    .catch(err => console.log(err));
}
```

### Service Pattern
```typescript
export class MyService {
  private dependency: Dependency;

  constructor() {
    this.dependency = new Dependency();
  }

  async doSomething(param: string): Promise<Result> {
    // Business logic here
    logger.info('Doing something', { param });
    return result;
  }
}

export default new MyService();
```

### Controller Pattern
```typescript
export class MyController {
  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const { param } = req.body;
      
      if (!param) {
        res.status(400).json({ error: 'Param required' });
        return;
      }

      const result = await myService.doSomething(param);
      
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error in controller:', { error: getErrorMessage(error) });
      res.status(500).json({
        error: 'Internal error',
        message: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }
}
```

## Adding New Features

### Adding a New Service

1. Create service file in `src/services/`:
```typescript
// src/services/myNew.service.ts
import logger from '../utils/logger';

export class MyNewService {
  async doWork(input: string): Promise<string> {
    logger.info('Doing work', { input });
    // Implementation
    return result;
  }
}

export default new MyNewService();
```

2. Add types in `src/types/index.ts`:
```typescript
export interface MyNewType {
  field: string;
  // ...
}
```

3. Create controller in `src/api/controllers/`:
```typescript
// src/api/controllers/myNew.controller.ts
import { Request, Response } from 'express';
import myNewService from '../../services/myNew.service';

export class MyNewController {
  async handleAction(req: Request, res: Response): Promise<void> {
    // Implementation
  }
}

export default new MyNewController();
```

4. Add routes in `src/api/routes/`:
```typescript
// src/api/routes/myNew.routes.ts
import { Router } from 'express';
import controller from '../controllers/myNew.controller';

const router = Router();
router.post('/action', controller.handleAction.bind(controller));

export default router;
```

5. Register routes in `src/api/routes/index.ts`:
```typescript
import myNewRoutes from './myNew.routes';
router.use('/mynew', myNewRoutes);
```

## Testing

### Unit Tests (Future)
```typescript
import { MyService } from './myService';

describe('MyService', () => {
  it('should do something', async () => {
    const service = new MyService();
    const result = await service.doSomething('test');
    expect(result).toBeDefined();
  });
});
```

### Integration Tests (Future)
```typescript
import request from 'supertest';
import app from './index';

describe('API Integration', () => {
  it('should create a lead', async () => {
    const response = await request(app)
      .post('/api/leads/discover')
      .send({ url: 'https://test.com' });
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

## Logging Standards

Use structured logging:

```typescript
// Good
logger.info('Lead discovered', { 
  leadId: lead.id, 
  domain: lead.domain,
  isQualified: lead.isQualified 
});

// Bad
logger.info(`Lead ${lead.id} discovered from ${lead.domain}`);
```

Log levels:
- `error`: Errors that need attention
- `warn`: Warning conditions
- `info`: Important events (API calls, state changes)
- `debug`: Detailed diagnostic info

## Environment Variables

Add new env vars to:
1. `.env.example` with documentation
2. `src/config/index.ts` with parsing and validation
3. README.md with description

## Security Guidelines

1. **Never commit secrets**: Use `.env` files (gitignored)
2. **Validate input**: Check all user inputs
3. **Rate limiting**: Use built-in rate limiter
4. **Error messages**: Don't leak sensitive info
5. **Dependencies**: Keep updated, audit regularly

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes following code style
4. Build and test: `npm run build && npm test`
5. Lint your code: `npm run lint`
6. Format your code: `npm run format`
7. Commit with clear messages
8. Push and create PR

## Commit Messages

Follow conventional commits:

```
feat: add email scheduling feature
fix: resolve circular JSON error in logging
docs: update API documentation
refactor: simplify lead service logic
test: add tests for email service
chore: update dependencies
```

## Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Types are properly defined
- [ ] Error handling is comprehensive
- [ ] Logging is appropriate
- [ ] No hardcoded values
- [ ] Comments explain complex logic
- [ ] Tests pass (when implemented)
- [ ] Documentation updated

## Questions?

Open an issue for:
- Feature requests
- Bug reports
- Architecture discussions
- Documentation improvements
