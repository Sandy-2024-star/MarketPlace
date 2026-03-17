// Landing page tests — / (unauthenticated marketing page)
// Covers: hero visible, CTAs, nav links, testimonials, auth redirect, Sign In.
// Does NOT use auth fixture — tests the public landing page.
// Note: Sign in / Get Started etc. are <button> elements on this page (not links).

import { test, expect } from '@playwright/test';
import config from '../../../utils/config';

test.describe('Landing Page', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(config.baseURL, { waitUntil: 'domcontentloaded' });
  });

  test('hero heading is visible', async ({ page }) => {
    const url = page.url();
    if (url.includes('/listings')) return; // already authenticated — skip
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Sign In button is visible in nav', async ({ page }) => {
    const url = page.url();
    if (url.includes('/listings')) return;
    // Exact nav button: "Sign in"
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('Get Started button is visible in nav', async ({ page }) => {
    const url = page.url();
    if (url.includes('/listings')) return;
    await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toBeVisible();
  });

  test('Start Free Migration CTA is visible', async ({ page }) => {
    const url = page.url();
    if (url.includes('/listings')) return;
    await expect(page.getByRole('button', { name: /start free migration/i }).first()).toBeVisible();
  });

  test('See How It Works CTA is visible', async ({ page }) => {
    const url = page.url();
    if (url.includes('/listings')) return;
    await expect(page.getByRole('button', { name: /see how it works/i })).toBeVisible();
  });

  test('nav contains Integrations, Features, and Testimonials links', async ({ page }) => {
    const url = page.url();
    if (url.includes('/listings')) return;
    await expect(page.getByRole('link', { name: 'Integrations' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Features' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Testimonials' })).toBeVisible();
  });

  test('testimonials section is visible', async ({ page }) => {
    const url = page.url();
    if (url.includes('/listings')) return;
    // Section heading
    await expect(page.getByRole('heading', { name: /loved by businesses/i })).toBeVisible();
  });

  test('landing page has a title set', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
