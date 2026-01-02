# WP Lead Hunter

> Production-grade web application for discovering qualified WordPress blogs, managing leads, generating personalized outreach emails via OpenAI, and syncing with Notion.

## Features

- 🔍 **Automated WordPress Blog Discovery** - Detect WordPress sites and extract metadata
- 📊 **Lead Qualification** - Score leads based on traffic, domain age, and custom criteria
- 🤖 **AI-Powered Email Generation** - Create personalized outreach emails using OpenAI GPT-4
- 📧 **Email Campaign Management** - Manage templates and track outreach efforts
- 🔄 **Notion Integration** - Bidirectional sync of leads and events with Notion databases
- 🏗️ **Clean Architecture** - Modular, type-safe, API-driven backend
- 🔒 **Security First** - Rate limiting, input validation, and secure configuration
- 📝 **Comprehensive Logging** - Structured logging with Winston
- 🎨 **Professional UI** - Clean, responsive interface for lead management

## Architecture

### Backend Structure

```
src/
├── config/           # Environment-based configuration
├── types/            # TypeScript type definitions
├── services/         # Business logic layer
│   ├── lead.service.ts
│   ├── email.service.ts
│   ├── openai.service.ts
│   ├── notion.service.ts
│   ├── wordpressDetector.service.ts
│   ├── domainAge.service.ts
│   └── trafficEstimator.service.ts
├── api/              # HTTP API layer
│   ├── controllers/  # Request handlers
│   ├── routes/       # Route definitions
│   └── middleware/   # Express middleware
├── utils/            # Utility functions
└── index.ts          # Application entry point
```

### Key Design Principles

- **Separation of Concerns** - Clear boundaries between layers
- **Dependency Injection** - Services are modular and testable
- **Type Safety** - Full TypeScript coverage
- **Configuration Management** - Environment-based settings
- **Error Handling** - Centralized error handling and logging
- **No Hardcoded Dependencies** - All integrations are configurable

## Installation

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key (optional, for email generation)
- Notion API key and Database ID (optional, for sync)

### Setup

1. **Clone the repository**

```bash
git clone https://github.com/brocketdesign/wp-lead-hunter.git
cd wp-lead-hunter
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
NODE_ENV=development
PORT=3000

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Notion Configuration
NOTION_API_KEY=your_notion_api_key_here
NOTION_DATABASE_ID=your_notion_database_id_here

# Application Configuration
LOG_LEVEL=info
MAX_CONCURRENT_REQUESTS=5
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Lead Discovery Configuration
MIN_DOMAIN_AGE_MONTHS=6
MIN_TRAFFIC_THRESHOLD=1000
```

4. **Build the application**

```bash
npm run build
```

5. **Start the server**

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3000`

## API Documentation

### Leads Endpoints

#### Discover a Lead

```http
POST /api/leads/discover
Content-Type: application/json

{
  "url": "https://example-wordpress-blog.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "url": "https://example-wordpress-blog.com",
    "domain": "example-wordpress-blog.com",
    "title": "Example Blog",
    "isWordPress": true,
    "isQualified": true,
    "qualificationScore": 75,
    "traffic": 5000,
    "domainAge": 24,
    "status": "QUALIFIED",
    ...
  }
}
```

#### Get All Leads

```http
GET /api/leads?status=QUALIFIED&isQualified=true&minScore=50
```

#### Get Single Lead

```http
GET /api/leads/:id
```

#### Update Lead

```http
PUT /api/leads/:id
Content-Type: application/json

{
  "status": "CONTACTED",
  "notes": "Sent initial outreach email"
}
```

#### Delete Lead

```http
DELETE /api/leads/:id
```

#### Sync Leads to Notion

```http
POST /api/leads/sync/notion
```

### Email Endpoints

#### Send Email

```http
POST /api/emails/send
Content-Type: application/json

{
  "leadId": "uuid",
  "templateId": "uuid" // optional
}
```

#### Create Email Template

```http
POST /api/emails/templates
Content-Type: application/json

{
  "name": "Initial Outreach",
  "subject": "Partnership Opportunity with {{blogName}}",
  "bodyTemplate": "Hi {{contactName}}...",
  "variables": ["blogName", "contactName"]
}
```

#### Get Templates

```http
GET /api/emails/templates
```

#### Update Template

```http
PUT /api/emails/templates/:id
```

#### Delete Template

```http
DELETE /api/emails/templates/:id
```

### Health Check

```http
GET /api/health
```

## Usage Examples

### 1. Discovering and Qualifying Leads

```bash
curl -X POST http://localhost:3000/api/leads/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://wordpress-blog.com"}'
```

### 2. Getting Qualified Leads

```bash
curl http://localhost:3000/api/leads?isQualified=true&minScore=60
```

### 3. Creating an Email Template

```bash
curl -X POST http://localhost:3000/api/emails/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Partnership Proposal",
    "subject": "Collaboration with {{blogName}}",
    "bodyTemplate": "Hello {{contactName}}, I found your blog at {{url}}...",
    "variables": ["blogName", "contactName", "url"]
  }'
```

### 4. Sending Personalized Email

```bash
curl -X POST http://localhost:3000/api/emails/send \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "lead-uuid",
    "templateId": "template-uuid"
  }'
```

## Configuration

### Lead Qualification Criteria

The system qualifies leads based on:

- **Domain Age** - Minimum age in months (configurable)
- **Traffic Estimate** - Minimum traffic threshold (configurable)
- **Email Availability** - Whether contact email is found
- **Custom Rules** - Additional qualification logic

### Notion Integration

To set up Notion sync:

1. Create a Notion integration at https://www.notion.so/my-integrations
2. Create a database in Notion with these properties:
   - Name (title)
   - URL (url)
   - Domain (text)
   - Status (select)
   - Email (email)
   - Traffic (number)
   - Domain Age (number)
   - Is WordPress (checkbox)
   - Is Qualified (checkbox)
   - Qualification Score (number)
   - Outreach Attempts (number)
   - Tags (multi-select)
   - Notes (text)
3. Share the database with your integration
4. Add the integration ID and database ID to `.env`

### OpenAI Configuration

The system uses GPT-4 for:
- Generating personalized email content
- Analyzing blog content for better targeting
- Creating context-aware subject lines

If no API key is provided, the system falls back to template-based email generation.

## Development

### Scripts

```bash
npm run dev         # Start development server with auto-reload
npm run build       # Build TypeScript to JavaScript
npm start           # Start production server
npm run lint        # Run ESLint
npm run lint:fix    # Fix ESLint issues
npm run format      # Format code with Prettier
npm run format:check # Check code formatting
```

### Adding New Services

1. Create service file in `src/services/`
2. Define TypeScript interfaces in `src/types/`
3. Import and use in controllers
4. Add routes in `src/api/routes/`

### Code Style

- TypeScript strict mode enabled
- ESLint for code quality
- Prettier for formatting
- Strong typing throughout

## Deployment

### Docker (Recommended)

```bash
# Build image
docker build -t wp-lead-hunter .

# Run container
docker run -p 3000:3000 --env-file .env wp-lead-hunter
```

### Traditional Deployment

1. Build the application: `npm run build`
2. Set environment variables
3. Run: `npm start`
4. Use a process manager (PM2, systemd) for production

## Security Considerations

- All API keys stored in environment variables
- Rate limiting enabled by default
- Input validation on all endpoints
- Helmet.js security headers
- CORS configured
- No sensitive data in logs

## Monitoring & Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- Console output (development)

Log levels: error, warn, info, debug

## Troubleshooting

### Common Issues

**Server won't start**
- Check if port 3000 is available
- Verify all dependencies installed: `npm install`
- Check `.env` file exists

**Lead discovery not working**
- Verify target site is accessible
- Check network connectivity
- Review logs for specific errors

**Notion sync failing**
- Verify API key and database ID
- Check database is shared with integration
- Ensure all required properties exist in Notion database

**Email generation errors**
- Verify OpenAI API key is valid
- Check API quota/limits
- System falls back to templates if API unavailable

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing documentation
- Review logs for error details

---

Built with TypeScript, Express, OpenAI, and Notion API
