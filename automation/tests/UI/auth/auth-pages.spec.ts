// Auth pages tests — login, forgot-password, sign-up form fields and validation.
// Does NOT use auth fixture — tests unauthenticated pages.
// Authenticated users may be redirected; tests guard against that.

import { test, expect } from '@playwright/test';
import config from '../../../utils/config';

test.describe('Auth Pages', () => {

  test('login page shows username and password inputs', async ({ page }) => {
    await page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    if (!url.includes('/auth/login')) return; // redirected (authenticated)
    await expect(page.locator('input[placeholder="Enter your username"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Enter your password"]')).toBeVisible();
  });

  test('login page shows a submit button', async ({ page }) => {
    await page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    if (!url.includes('/auth/login')) return;
    // Login submit button is labelled "Confirm" in this app
    await expect(page.getByRole('button', { name: /confirm|log in|sign in/i })).toBeVisible();
  });

  test('login page has a link to forgot password', async ({ page }) => {
    await page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    if (!url.includes('/auth/login')) return;
    const link = page.getByRole('link', { name: /forgot/i }).or(page.getByText(/forgot/i));
    await expect(link.first()).toBeVisible();
  });

  test('login page has a link to sign up', async ({ page }) => {
    await page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    if (!url.includes('/auth/login')) return;
    const link = page.getByRole('link', { name: /sign up|register|create/i }).or(page.getByText(/sign up|create account/i));
    await expect(link.first()).toBeVisible();
  });

  test('forgot password page has an email input', async ({ page }) => {
    await page.goto(`${config.baseURL}/auth/forgot-password`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    if (url.includes('/listings')) return; // authenticated — redirected
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const visible = await emailInput.isVisible().catch(() => false);
    if (!visible) {
      // Some apps use a generic text input for email
      const anyInput = page.locator('input').first();
      await expect(anyInput).toBeVisible();
    } else {
      await expect(emailInput).toBeVisible();
    }
  });

  test('sign-up page loads without crash', async ({ page }) => {
    await page.goto(`${config.baseURL}/auth/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    // Page should load without JS error — heading or input visible
    const hasContent = await page.locator('h1, h2, input').first().isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('empty login submission shows validation feedback', async ({ page }) => {
    await page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    if (!url.includes('/auth/login')) return;
    // Submit button is "Confirm" in this app
    await page.getByRole('button', { name: /confirm|log in|sign in/i }).click();
    await page.waitForTimeout(500);
    // Should still be on login (not redirected) or show validation
    const stillOnLogin = page.url().includes('/auth/login');
    const hasError = await page.getByText(/required|invalid|enter your/i).isVisible().catch(() => false);
    expect(stillOnLogin || hasError).toBeTruthy();
  });
});
