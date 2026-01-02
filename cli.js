#!/usr/bin/env node

/**
 * WP Lead Hunter CLI
 * 
 * A command-line interface for interacting with the WP Lead Hunter API
 * 
 * Usage:
 *   npm run cli discover <url>
 *   npm run cli list
 *   npm run cli template create <name>
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

const commands = {
  async discover(url) {
    if (!url) {
      console.error('Error: URL is required');
      console.log('Usage: npm run cli discover <url>');
      process.exit(1);
    }

    try {
      console.log(`🔍 Discovering lead: ${url}`);
      const response = await axios.post(`${API_URL}/leads/discover`, { url });
      
      const lead = response.data.data;
      console.log('\n✅ Lead discovered:');
      console.log(`   ID: ${lead.id}`);
      console.log(`   Domain: ${lead.domain}`);
      console.log(`   WordPress: ${lead.isWordPress ? '✓' : '✗'}`);
      console.log(`   Qualified: ${lead.isQualified ? '✓' : '✗'}`);
      if (lead.qualificationScore) {
        console.log(`   Score: ${lead.qualificationScore}/100`);
      }
      if (lead.traffic) {
        console.log(`   Traffic: ~${lead.traffic} visits/month`);
      }
      if (lead.domainAge) {
        console.log(`   Domain Age: ${lead.domainAge} months`);
      }
    } catch (error) {
      console.error('❌ Error:', error.response?.data?.message || error.message);
      process.exit(1);
    }
  },

  async list(filter) {
    try {
      let url = `${API_URL}/leads`;
      if (filter === 'qualified') {
        url += '?isQualified=true';
      }

      console.log('📋 Fetching leads...');
      const response = await axios.get(url);
      
      const leads = response.data.data;
      console.log(`\n✅ Found ${leads.length} lead(s):\n`);
      
      leads.forEach((lead, index) => {
        console.log(`${index + 1}. ${lead.domain}`);
        console.log(`   Status: ${lead.status}`);
        console.log(`   WordPress: ${lead.isWordPress ? '✓' : '✗'}`);
        console.log(`   Qualified: ${lead.isQualified ? '✓' : '✗'}`);
        console.log(`   Score: ${lead.qualificationScore || 'N/A'}`);
        console.log('');
      });
    } catch (error) {
      console.error('❌ Error:', error.response?.data?.message || error.message);
      process.exit(1);
    }
  },

  async templates() {
    try {
      console.log('📧 Fetching email templates...');
      const response = await axios.get(`${API_URL}/emails/templates`);
      
      const templates = response.data.data;
      console.log(`\n✅ Found ${templates.length} template(s):\n`);
      
      templates.forEach((template, index) => {
        console.log(`${index + 1}. ${template.name}`);
        console.log(`   Subject: ${template.subject}`);
        console.log(`   Variables: ${template.variables.join(', ')}`);
        console.log('');
      });
    } catch (error) {
      console.error('❌ Error:', error.response?.data?.message || error.message);
      process.exit(1);
    }
  },

  async health() {
    try {
      console.log('🏥 Checking API health...');
      const response = await axios.get(`${API_URL}/health`);
      
      console.log('\n✅ API is healthy!');
      console.log(`   Status: ${response.data.status}`);
      console.log(`   Uptime: ${Math.floor(response.data.uptime)}s`);
    } catch (error) {
      console.error('❌ API is down:', error.message);
      process.exit(1);
    }
  },

  help() {
    console.log(`
WP Lead Hunter CLI

Usage:
  npm run cli <command> [args]

Commands:
  discover <url>     Discover and qualify a WordPress blog
  list [qualified]   List all leads (or only qualified ones)
  templates          List all email templates
  health             Check API health status
  help               Show this help message

Examples:
  npm run cli discover https://example-blog.com
  npm run cli list qualified
  npm run cli templates
  npm run cli health
    `);
  }
};

// Parse command line arguments
const [,, command, ...args] = process.argv;

if (!command || command === 'help') {
  commands.help();
  process.exit(0);
}

if (!commands[command]) {
  console.error(`❌ Unknown command: ${command}`);
  commands.help();
  process.exit(1);
}

// Execute command
commands[command](...args);
