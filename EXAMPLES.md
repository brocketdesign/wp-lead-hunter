# WP Lead Hunter - Usage Examples

This document provides practical examples of how to use the WP Lead Hunter application.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Lead Discovery](#lead-discovery)
3. [Email Templates](#email-templates)
4. [Sending Emails](#sending-emails)
5. [Notion Integration](#notion-integration)
6. [Advanced Workflows](#advanced-workflows)

## Basic Setup

### Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### Verify Server is Running

```bash
# Using cURL
curl http://localhost:3000/api/health

# Using CLI
npm run cli health
```

## Lead Discovery

### Discover a Single Lead

```bash
# Using cURL
curl -X POST http://localhost:3000/api/leads/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://techcrunch.com"}'

# Using CLI
npm run cli discover https://techcrunch.com
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "url": "https://techcrunch.com",
    "domain": "techcrunch.com",
    "title": "TechCrunch",
    "isWordPress": true,
    "isQualified": true,
    "qualificationScore": 85,
    "traffic": 15000000,
    "domainAge": 180,
    "status": "QUALIFIED",
    "tags": ["qualified"]
  }
}
```

### Discover Multiple Leads

```bash
# Bash script to discover multiple leads
for url in \
  "https://blog1.com" \
  "https://blog2.com" \
  "https://blog3.com"
do
  curl -X POST http://localhost:3000/api/leads/discover \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}"
  echo ""
done
```

### Filter Qualified Leads

```bash
# Get only qualified leads
curl http://localhost:3000/api/leads?isQualified=true

# Get leads with minimum score
curl http://localhost:3000/api/leads?minScore=70

# Get leads by status
curl http://localhost:3000/api/leads?status=QUALIFIED
```

## Email Templates

### Create a Template

```bash
curl -X POST http://localhost:3000/api/emails/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Partnership Proposal",
    "subject": "Collaboration Opportunity with {{blogName}}",
    "bodyTemplate": "Hi {{contactName}},\n\nI came across {{blogName}} ({{url}}) and was really impressed by your content on [topic].\n\nI'\''d love to discuss a potential partnership opportunity that could benefit both our audiences.\n\nWould you be interested in a quick chat?\n\nBest regards,\nYour Name",
    "variables": ["blogName", "contactName", "url"]
  }'
```

### List All Templates

```bash
# Using cURL
curl http://localhost:3000/api/emails/templates

# Using CLI
npm run cli templates
```

### Update a Template

```bash
curl -X PUT http://localhost:3000/api/emails/templates/<template-id> \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Updated Subject Line"
  }'
```

## Sending Emails

### Send Email to a Lead

```bash
# First, get a lead ID and template ID
LEAD_ID=$(curl -s http://localhost:3000/api/leads?isQualified=true | jq -r '.data[0].id')
TEMPLATE_ID=$(curl -s http://localhost:3000/api/emails/templates | jq -r '.data[0].id')

# Send the email
curl -X POST http://localhost:3000/api/emails/send \
  -H "Content-Type: application/json" \
  -d "{
    \"leadId\": \"$LEAD_ID\",
    \"templateId\": \"$TEMPLATE_ID\"
  }"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "email-uuid",
    "sentAt": "2026-01-02T12:00:00.000Z",
    "subject": "Collaboration Opportunity with TechCrunch",
    "status": "SENT"
  }
}
```

## Notion Integration

### Sync All Qualified Leads to Notion

```bash
curl -X POST http://localhost:3000/api/leads/sync/notion
```

### Automatic Sync on Lead Update

When you update a lead's status or information, it automatically syncs to Notion if:
- The lead is qualified
- Notion is configured (API key and database ID in .env)

```bash
# Update lead (will auto-sync)
curl -X PUT http://localhost:3000/api/leads/<lead-id> \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CONTACTED",
    "notes": "Sent initial outreach email"
  }'
```

## Advanced Workflows

### Complete Outreach Campaign Workflow

```bash
#!/bin/bash

# 1. Discover leads from a list
echo "Step 1: Discovering leads..."
for url in $(cat blog-list.txt); do
  curl -X POST http://localhost:3000/api/leads/discover \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}"
  sleep 2  # Rate limiting
done

# 2. Create email template
echo "Step 2: Creating email template..."
TEMPLATE_ID=$(curl -s -X POST http://localhost:3000/api/emails/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Campaign Jan 2026",
    "subject": "Quick question about {{blogName}}",
    "bodyTemplate": "Hi {{contactName}}...",
    "variables": ["blogName", "contactName"]
  }' | jq -r '.data.id')

# 3. Get qualified leads
echo "Step 3: Getting qualified leads..."
LEADS=$(curl -s "http://localhost:3000/api/leads?isQualified=true&minScore=60")

# 4. Send emails to qualified leads
echo "Step 4: Sending emails..."
echo "$LEADS" | jq -r '.data[].id' | while read LEAD_ID; do
  curl -X POST http://localhost:3000/api/emails/send \
    -H "Content-Type: application/json" \
    -d "{\"leadId\": \"$LEAD_ID\", \"templateId\": \"$TEMPLATE_ID\"}"
  sleep 5  # Rate limiting
done

# 5. Sync to Notion
echo "Step 5: Syncing to Notion..."
curl -X POST http://localhost:3000/api/leads/sync/notion

echo "Campaign complete!"
```

### Lead Scoring and Prioritization

```bash
# Get high-value leads (score 80+)
curl "http://localhost:3000/api/leads?isQualified=true&minScore=80"

# Get leads by traffic
curl http://localhost:3000/api/leads | jq '.data | sort_by(.traffic) | reverse'

# Get newest leads
curl http://localhost:3000/api/leads | jq '.data | sort_by(.createdAt) | reverse'
```

### Batch Lead Processing

```javascript
// Node.js script for batch processing
const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://localhost:3000/api';

async function processLeads() {
  // Read URLs from file
  const urls = fs.readFileSync('leads.txt', 'utf-8').split('\n');
  
  // Discover all leads
  const leads = [];
  for (const url of urls) {
    if (!url.trim()) continue;
    
    try {
      const response = await axios.post(`${API_URL}/leads/discover`, { url });
      leads.push(response.data.data);
      console.log(`✅ Discovered: ${url}`);
    } catch (error) {
      console.error(`❌ Failed: ${url}`, error.message);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Filter qualified
  const qualified = leads.filter(l => l.isQualified);
  console.log(`\n📊 Results: ${qualified.length}/${leads.length} qualified`);
  
  // Export results
  fs.writeFileSync('qualified-leads.json', JSON.stringify(qualified, null, 2));
  console.log('💾 Saved to qualified-leads.json');
}

processLeads();
```

### Monitoring and Reporting

```bash
# Get campaign statistics
curl http://localhost:3000/api/leads | jq '{
  total: .count,
  qualified: [.data[] | select(.isQualified)] | length,
  contacted: [.data[] | select(.status == "CONTACTED")] | length,
  avgScore: ([.data[] | .qualificationScore // 0] | add / length)
}'

# Get leads by status
curl http://localhost:3000/api/leads | jq '[.data | group_by(.status)[] | {status: .[0].status, count: length}]'
```

### Using with Python

```python
import requests
import json

API_URL = "http://localhost:3000/api"

# Discover lead
def discover_lead(url):
    response = requests.post(
        f"{API_URL}/leads/discover",
        json={"url": url}
    )
    return response.json()["data"]

# Get all qualified leads
def get_qualified_leads():
    response = requests.get(
        f"{API_URL}/leads",
        params={"isQualified": "true"}
    )
    return response.json()["data"]

# Send email
def send_email(lead_id, template_id):
    response = requests.post(
        f"{API_URL}/emails/send",
        json={
            "leadId": lead_id,
            "templateId": template_id
        }
    )
    return response.json()["data"]

# Example usage
if __name__ == "__main__":
    # Discover
    lead = discover_lead("https://example-blog.com")
    print(f"Discovered: {lead['domain']}")
    print(f"Qualified: {lead['isQualified']}")
    
    # Get qualified
    qualified = get_qualified_leads()
    print(f"\nQualified leads: {len(qualified)}")
    
    for lead in qualified:
        print(f"  - {lead['domain']} (score: {lead.get('qualificationScore', 'N/A')})")
```

## Error Handling

### Handling API Errors

```bash
# Example with error handling
response=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/leads/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "invalid-url"}')

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
  echo "Success: $body"
else
  echo "Error ($http_code): $body"
fi
```

## Best Practices

1. **Rate Limiting**: Add delays between requests (2-5 seconds)
2. **Error Handling**: Always check response status and handle errors
3. **Data Validation**: Validate URLs before discovering
4. **Batch Processing**: Process in small batches for better control
5. **Logging**: Keep logs of all operations for debugging
6. **Testing**: Test with a small sample before full campaign

## Integration with Other Tools

### Zapier Integration

Create a webhook trigger in Zapier pointing to your API endpoints:

```
POST http://your-server.com/api/leads/discover
```

### Google Sheets Integration

Use Apps Script to interact with the API:

```javascript
function discoverLead(url) {
  var response = UrlFetchApp.fetch('http://localhost:3000/api/leads/discover', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({url: url})
  });
  
  return JSON.parse(response.getContentText());
}
```

## Troubleshooting

### Common Issues

1. **Connection Refused**: Make sure server is running (`npm start`)
2. **404 Errors**: Check API endpoint URLs
3. **500 Errors**: Check server logs in `logs/error.log`
4. **Empty Results**: Verify lead qualification criteria in `.env`

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

Check logs:
```bash
tail -f logs/combined.log
```
