// Shared TypeScript types for the Flow Marketplace automation framework.

import type { Page } from '@playwright/test';

// ── Config ────────────────────────────────────────────────────────────────────

export interface Config {
  baseURL: string;
  apiURL: string;
  serviceURL: string;
  username: string;
  password: string;
  defaultTimeout: number;
  stealthMode: boolean;
}

// ── Playwright helpers ────────────────────────────────────────────────────────

export type WaitUntilState = 'load' | 'domcontentloaded' | 'networkidle';

export type GotoOptions = {
  waitUntil?: WaitUntilState;
};

// ── Stealth ───────────────────────────────────────────────────────────────────

export interface StealthModule {
  applyStealthScripts: (page: Page) => Promise<void>;
  getStealthLaunchArgs: () => string[];
  STEALTH: boolean;
}

// ── Retry ─────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  retries?: number;
  delay?: number;
  label?: string;
}

// ── Shopify SSO ───────────────────────────────────────────────────────────────

export interface ShopifyCredentials {
  url: string;
  username: string;
  password: string;
  storesUrl: string;
  orgId: string;
  shop: string;
  ssoUrl: string;
  flowUrl: string;
  sessionB64?: string;
}

export interface ShopifySession {
  cookies: unknown[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

// ── Migration ─────────────────────────────────────────────────────────────────

export interface MigrationConfig {
  id: string;
  source: string;
  target: string;
  label?: string;
  tags?: string[];
  phase?: number;
}

// ── Dashboard / Reporter ──────────────────────────────────────────────────────

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'flaky';

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationMs: number;
}
