#!/bin/bash

# WP Lead Hunter - Demo Script
# This script demonstrates the complete workflow of the application

API_URL="http://localhost:3000/api"

echo "=== WP Lead Hunter Demo ==="
echo ""

echo "1. Checking API health..."
curl -s "$API_URL/health" | jq .
echo ""

echo "2. Discovering a lead (WordPress.org blog)..."
LEAD_RESPONSE=$(curl -s -X POST "$API_URL/leads/discover" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://wordpress.org/news/"}')
echo "$LEAD_RESPONSE" | jq .
LEAD_ID=$(echo "$LEAD_RESPONSE" | jq -r '.data.id')
echo ""

echo "3. Creating an email template..."
TEMPLATE_RESPONSE=$(curl -s -X POST "$API_URL/emails/templates" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Initial Outreach",
    "subject": "Partnership Opportunity with {{blogName}}",
    "bodyTemplate": "Hi {{contactName}},\n\nI discovered {{blogName}} and was impressed!\n\nBest regards",
    "variables": ["blogName", "contactName"]
  }')
echo "$TEMPLATE_RESPONSE" | jq .
TEMPLATE_ID=$(echo "$TEMPLATE_RESPONSE" | jq -r '.data.id')
echo ""

echo "4. Getting all leads..."
curl -s "$API_URL/leads" | jq .
echo ""

echo "5. Getting all email templates..."
curl -s "$API_URL/emails/templates" | jq .
echo ""

echo "6. Getting specific lead details..."
curl -s "$API_URL/leads/$LEAD_ID" | jq .
echo ""

echo "=== Demo Complete ==="
echo ""
echo "Lead ID: $LEAD_ID"
echo "Template ID: $TEMPLATE_ID"
echo ""
echo "To send an email to this lead, run:"
echo "curl -X POST $API_URL/emails/send -H 'Content-Type: application/json' -d '{\"leadId\": \"$LEAD_ID\", \"templateId\": \"$TEMPLATE_ID\"}'"
