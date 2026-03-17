// Central configuration helper for the automation framework.
// Loads environment variables using dotenv and exposes commonly used settings.

import path from 'path';
import dotenv from 'dotenv';
import type { Config } from '../types';

// Load .env from the automation project root
dotenv.config({
  path: path.resolve(__dirname, '..', '.env'),
});

const baseURL = process.env.BASE_URL || 'https://marketplace.flow.staging.linktoany.com';

const config: Config = {
  baseURL,
  apiURL:         process.env.API_URL || `${baseURL}/api/1.0`,
  serviceURL:     `${baseURL}/api/1.0/standalone-flow-marketplace-backend-service`,
  username:       process.env.USERNAME || 'Automation',
  password:       process.env.PASSWORD || '',
  defaultTimeout: 30000,
  stealthMode:    process.env.STEALTH_MODE === 'true',
};

export default config;
