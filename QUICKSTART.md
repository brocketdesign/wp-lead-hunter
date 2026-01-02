# WP Lead Hunter - Quick Start Guide

## Prerequisites

Before you begin, ensure you have:
- Node.js 18 or higher installed
- npm package manager
- (Optional) OpenAI API key for AI-powered email generation
- (Optional) Notion API key and database for lead sync

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/brocketdesign/wp-lead-hunter.git
   cd wp-lead-hunter
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys (optional)
   ```

4. **Build the application**
   ```bash
   npm run build
   ```

## Running the Application

### Development Mode
```bash
npm run dev
```
The server will start on http://localhost:3000 with auto-reload enabled.

### Production Mode
```bash
npm start
```

## Testing the API

### Using cURL

1. **Check API health**
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **Discover a WordPress blog**
   ```bash
   curl -X POST http://localhost:3000/api/leads/discover \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example-wordpress-blog.com"}'
   ```

3. **Get all leads**
   ```bash
   curl http://localhost:3000/api/leads
   ```

4. **Create an email template**
   ```bash
   curl -X POST http://localhost:3000/api/emails/templates \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Outreach Template",
       "subject": "Partnership with {{blogName}}",
       "bodyTemplate": "Hi {{contactName}}...",
       "variables": ["blogName", "contactName"]
     }'
   ```

5. **Send an email to a lead**
   ```bash
   curl -X POST http://localhost:3000/api/emails/send \
     -H "Content-Type: application/json" \
     -d '{"leadId": "lead-uuid", "templateId": "template-uuid"}'
   ```

### Using the Demo Script

Run the included demo script to see the complete workflow:

```bash
./demo.sh
```

This will:
- Check API health
- Discover a lead
- Create an email template
- Show all leads and templates
- Provide instructions for sending emails

## Common Workflows

### Workflow 1: Discover and Qualify Leads

```bash
# Discover multiple leads
for url in "https://blog1.com" "https://blog2.com" "https://blog3.com"; do
  curl -X POST http://localhost:3000/api/leads/discover \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}"
done

# Get only qualified leads
curl "http://localhost:3000/api/leads?isQualified=true"
```

### Workflow 2: Email Campaign

```bash
# 1. Create template
TEMPLATE_ID=$(curl -X POST http://localhost:3000/api/emails/templates \
  -H "Content-Type: application/json" \
  -d '{"name":"Campaign1","subject":"Test","bodyTemplate":"Body","variables":[]}' \
  | jq -r '.data.id')

# 2. Get qualified leads
LEADS=$(curl -s "http://localhost:3000/api/leads?isQualified=true")

# 3. Send emails to each lead
# (Extract lead IDs and send individually)
```

### Workflow 3: Notion Sync

```bash
# Sync all qualified leads to Notion
curl -X POST http://localhost:3000/api/leads/sync/notion
```

## API Endpoints Reference

### Leads
- `POST /api/leads/discover` - Discover and qualify a lead
- `GET /api/leads` - Get all leads (with optional filters)
- `GET /api/leads/:id` - Get a specific lead
- `PUT /api/leads/:id` - Update a lead
- `DELETE /api/leads/:id` - Delete a lead
- `POST /api/leads/sync/notion` - Sync leads to Notion

### Emails
- `POST /api/emails/send` - Send an email to a lead
- `POST /api/emails/templates` - Create email template
- `GET /api/emails/templates` - Get all templates
- `GET /api/emails/templates/:id` - Get specific template
- `PUT /api/emails/templates/:id` - Update template
- `DELETE /api/emails/templates/:id` - Delete template

### System
- `GET /api/health` - Health check
- `GET /` - API information

## Troubleshooting

### Server won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill the process if needed
kill -9 <PID>

# Try a different port
PORT=3001 npm start
```

### Build errors
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

### Module not found errors
```bash
# Reinstall dependencies
rm -rf node_modules/
npm install
```

## Docker Deployment

### Build Docker image
```bash
docker build -t wp-lead-hunter .
```

### Run with Docker Compose
```bash
docker-compose up -d
```

### View logs
```bash
docker-compose logs -f
```

## Configuration Options

All configuration is done via environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `LOG_LEVEL` | Logging level | info |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `NOTION_API_KEY` | Notion API key | - |
| `NOTION_DATABASE_ID` | Notion database ID | - |
| `MIN_DOMAIN_AGE_MONTHS` | Min domain age for qualification | 6 |
| `MIN_TRAFFIC_THRESHOLD` | Min traffic for qualification | 1000 |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit per window | 100 |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 60000 |

## Next Steps

1. Set up your Notion database (see README.md for schema)
2. Add your OpenAI API key for AI-powered emails
3. Start discovering leads
4. Create email templates
5. Launch outreach campaigns
6. Monitor results in Notion

## Support

For issues or questions:
- Check the main README.md for detailed documentation
- Review the logs in `logs/` directory
- Open an issue on GitHub
