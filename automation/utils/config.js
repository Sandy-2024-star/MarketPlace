// Central configuration helper for the automation framework.
// Loads environment variables using dotenv and exposes commonly used settings.

const path = require('path');
const dotenv = require('dotenv');

// Load .env from the automation project root
dotenv.config({
  path: path.resolve(__dirname, '..', '.env'),
});

const baseURL = process.env.BASE_URL || 'https://marketplace.flow.staging.linktoany.com';

const config = {
  baseURL,
  apiURL:       process.env.API_URL || `${baseURL}/api/1.0`,
  serviceURL:   `${baseURL}/api/1.0/standalone-flow-marketplace-backend-service`,
  username:     process.env.USERNAME || 'Automation',
  password:     process.env.PASSWORD || 'sandeshp',
  defaultTimeout: 30000,
  stealthMode:  process.env.STEALTH_MODE === 'true',
};

module.exports = config;

