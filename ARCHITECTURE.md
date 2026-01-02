# System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         WP Lead Hunter                          │
│                   Production-Grade Web Application              │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   CLI Tool   │    │  REST API    │    │   Frontend   │
│   (Node.js)  │───▶│  (Express)   │◀───│  (Future)    │
└──────────────┘    └──────────────┘    └──────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌──────▼──────┐  ┌─────────▼────────┐
│  Controllers   │  │ Middleware  │  │     Routes       │
│  - Lead        │  │ - Errors    │  │  - Lead routes   │
│  - Email       │  │ - RateLimit │  │  - Email routes  │
└────────────────┘  └─────────────┘  └──────────────────┘
        │
        │ Delegates to
        │
┌───────▼────────────────────────────────────────────────┐
│                    Service Layer                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │Lead Service │  │Email Service│  │Notion Service│  │
│  └─────────────┘  └─────────────┘  └──────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │WP Detector  │  │Domain Age   │  │Traffic Est.  │  │
│  └─────────────┘  └─────────────┘  └──────────────┘  │
│  ┌─────────────┐                                      │
│  │OpenAI Svc   │                                      │
│  └─────────────┘                                      │
└────────────────────────────────────────────────────────┘
        │
        │ Uses
        │
┌───────▼────────────────────────────────────────────────┐
│              External Integrations                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │OpenAI API   │  │Notion API   │  │WHOIS Service │  │
│  │(GPT-4)      │  │(Database)   │  │(Domain Info) │  │
│  └─────────────┘  └─────────────┘  └──────────────┘  │
│  ┌─────────────┐                                      │
│  │Internet     │                                      │
│  │Archive API  │                                      │
│  └─────────────┘                                      │
└────────────────────────────────────────────────────────┘
```

## Layer Architecture

### 1. HTTP Layer (API)

**Routes** → **Controllers** → **Services**

- **Routes**: Define URL patterns and HTTP methods
- **Controllers**: Handle request/response, validation, error formatting
- **Middleware**: Cross-cutting concerns (logging, auth, rate limiting)

### 2. Business Logic Layer (Services)

Each service is a singleton with a specific responsibility:

```typescript
LeadService
  ├─ discoverAndQualifyLead()
  ├─ getLead()
  ├─ getAllLeads()
  ├─ updateLead()
  └─ deleteLead()

EmailService
  ├─ sendEmail()
  ├─ createTemplate()
  └─ manageTemplates()

NotionService
  ├─ syncLead()
  ├─ syncEvent()
  └─ batchSyncLeads()

WordPressDetectorService
  ├─ isWordPressSite()
  └─ extractMetadata()

DomainAgeService
  └─ getDomainAgeInMonths()

TrafficEstimatorService
  └─ estimateTraffic()

OpenAIService
  ├─ generatePersonalizedEmail()
  └─ analyzeBlogContent()
```

### 3. Infrastructure Layer

- **Config**: Environment-based configuration
- **Logger**: Winston structured logging
- **Helpers**: Utility functions
- **Types**: TypeScript type definitions

## Data Flow Examples

### Lead Discovery Flow

```
1. POST /api/leads/discover { url: "..." }
   │
   ├─ LeadController.discoverLead()
   │   │
   │   ├─ Validate input
   │   └─ Call LeadService.discoverAndQualifyLead()
   │       │
   │       ├─ Extract domain from URL
   │       ├─ Check if WordPress (WordPressDetectorService)
   │       ├─ Extract metadata (title, description, email)
   │       ├─ Get domain age (DomainAgeService)
   │       ├─ Estimate traffic (TrafficEstimatorService)
   │       ├─ Calculate qualification score
   │       ├─ Determine if qualified
   │       └─ Return Lead object
   │
   └─ Return JSON response
```

### Email Generation & Sending Flow

```
2. POST /api/emails/send { leadId: "...", templateId: "..." }
   │
   ├─ EmailController.sendEmail()
   │   │
   │   ├─ Validate input
   │   ├─ Get lead from LeadService
   │   ├─ Get template (optional)
   │   └─ Call EmailService.sendEmail()
   │       │
   │       ├─ OpenAIService.generatePersonalizedEmail()
   │       │   ├─ Build prompt with lead data
   │       │   ├─ Call OpenAI API
   │       │   └─ Parse response
   │       │
   │       ├─ Create EmailRecord
   │       ├─ Send via provider (future)
   │       ├─ NotionService.syncEvent()
   │       └─ Return EmailRecord
   │
   └─ Update lead with email record
```

### Notion Sync Flow

```
3. POST /api/leads/sync/notion
   │
   ├─ LeadController.syncToNotion()
   │   │
   │   └─ Call LeadService.syncAllToNotion()
   │       │
   │       ├─ Get all qualified leads
   │       └─ NotionService.batchSyncLeads()
   │           │
   │           └─ For each lead:
   │               ├─ Check if has notionPageId
   │               ├─ Create or update Notion page
   │               ├─ Map lead properties to Notion
   │               ├─ Call Notion API
   │               └─ Update lead with notionPageId
   │
   └─ Return success
```

## Type System

### Core Domain Types

```typescript
Lead {
  id: string
  url: string
  domain: string
  title?: string
  email?: string
  
  // Metrics
  traffic?: number
  domainAge?: number
  isWordPress: boolean
  isQualified: boolean
  qualificationScore?: number
  
  // Outreach
  status: LeadStatus
  outreachAttempts: number
  emailsSent: EmailRecord[]
  
  // Sync
  notionPageId?: string
  lastSyncedAt?: Date
}

EmailRecord {
  id: string
  sentAt: Date
  subject: string
  body: string
  status: EmailStatus
}

EmailTemplate {
  id: string
  name: string
  subject: string
  bodyTemplate: string
  variables: string[]
}
```

## Configuration Architecture

```
Environment Variables (.env)
        │
        ├─ Loaded by dotenv
        │
        ▼
Config Object (src/config/index.ts)
        │
        ├─ Typed configuration
        ├─ Validation
        ├─ Defaults
        │
        ▼
Imported by Services
        │
        └─ config.openai.apiKey
           config.notion.databaseId
           config.discovery.minDomainAge
           etc.
```

## Error Handling Strategy

```
Service Layer
  ├─ Try-Catch blocks
  ├─ Log errors with context
  └─ Return null/empty/fallback
        │
        ▼
Controller Layer
  ├─ Try-Catch blocks
  ├─ Check for null/errors
  ├─ Format error response
  └─ Set appropriate HTTP status
        │
        ▼
Error Middleware (Fallback)
  ├─ Catch uncaught errors
  ├─ Log to error.log
  └─ Return 500 with safe message
```

## Logging Architecture

```
Application Code
  ├─ logger.info()
  ├─ logger.error()
  ├─ logger.warn()
  └─ logger.debug()
        │
        ▼
Winston Logger
  ├─ Format: JSON + Timestamp
  ├─ Sanitize (no circular refs)
  │
  ├─ Console (colored, formatted)
  ├─ logs/combined.log (all logs)
  └─ logs/error.log (errors only)
```

## Deployment Architecture

### Development

```
Developer Machine
  │
  ├─ npm run dev
  │   └─ nodemon + ts-node
  │       └─ Auto-reload on file changes
  │
  └─ Access: http://localhost:3000
```

### Production (Docker)

```
Docker Host
  │
  ├─ docker-compose up
  │   │
  │   └─ wp-lead-hunter container
  │       ├─ Built image from Dockerfile
  │       ├─ Environment from .env
  │       ├─ Logs to volume
  │       └─ Health checks enabled
  │
  └─ Access: http://host:3000
```

## Security Layers

```
Request
  │
  ├─ Rate Limiter (max 100/min)
  │   └─ 429 if exceeded
  │
  ├─ Helmet Headers
  │   ├─ CSP
  │   ├─ XSS Protection
  │   └─ HSTS
  │
  ├─ CORS
  │   └─ Allowed origins
  │
  ├─ Input Validation
  │   └─ Check required fields
  │
  └─ Business Logic
```

## Scalability Considerations

### Current (In-Memory)
- Single instance
- No shared state
- Simple deployment

### Future (Database + Redis)

```
Load Balancer
  │
  ├─ Instance 1 ──┐
  ├─ Instance 2 ──┼─▶ Shared Database
  └─ Instance N ──┘       │
                          ├─ PostgreSQL (data)
                          └─ Redis (cache/sessions)
```

## Module Dependencies

```
index.ts
  └─ Server
      ├─ express
      ├─ config
      ├─ logger
      ├─ routes
      │   └─ controllers
      │       └─ services
      │           ├─ External APIs
      │           └─ helpers
      └─ middleware
```

## File Organization Philosophy

```
src/
├── api/              # HTTP layer (Express)
│   ├── controllers/  # Request handlers
│   ├── middleware/   # Express middleware
│   └── routes/       # URL routing
│
├── services/         # Business logic (pure)
│   └── *.service.ts  # One file per service
│
├── types/            # TypeScript types
│   └── index.ts      # All domain types
│
├── config/           # Configuration
│   └── index.ts      # Env-based config
│
├── utils/            # Utilities
│   ├── logger.ts     # Logging setup
│   └── helpers.ts    # Helper functions
│
└── index.ts          # Application entry
```

**Principles:**
- Clear separation of concerns
- One responsibility per file
- Easy to find and modify
- Testable in isolation
- No circular dependencies

## Extension Points

To add new functionality:

1. **New API endpoint**: Add route → controller → service
2. **New integration**: Add service in `src/services/`
3. **New data type**: Add to `src/types/index.ts`
4. **New middleware**: Add to `src/api/middleware/`
5. **New configuration**: Add to `src/config/index.ts`

The architecture supports extension without modification (Open/Closed Principle).
