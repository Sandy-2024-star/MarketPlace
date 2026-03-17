// Forgot Password UI tests — /auth/forgot-password
// Covers: form visibility, navigation from login, empty submit, valid email submit.

import { test, expect } from '@playwright/test';
import { ForgotPasswordPage } from '../../../pages/ForgotPasswordPage';
import { LoginPage } from '../../../pages/LoginPage';
import config from '../../../utils/config';

test.describe('Forgot Password UI', () => {
  test('should show email input and Submit button', async ({ page }) => {
    const fp = new ForgotPasswordPage(page);
    await fp.goto();
    await fp.waitForForm();
    await expect(fp.emailInput).toBeVisible();
    await expect(fp.submitButton).toBeVisible();
  });

  test('should have "Forgot password?" link on the login page', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.waitForForm();
    await expect(login.forgotPasswordLink).toBeVisible();
    const href = await login.forgotPasswordLink.getAttribute('href').catch(() => '');
    console.log('[fp] link href:', href);
    // Link should point toward forgot-password (directly or as relative path)
    expect(href).toMatch(/forgot[-_]?password/i);
  });

  test('should stay on forgot-password page when submitted with empty email', async ({ page }) => {
    const fp = new ForgotPasswordPage(page);
    await fp.goto();
    await fp.waitForForm();
    await fp.submitButton.click();
    await page.waitForTimeout(1000);
    const url      = page.url();
    const hasError = await page.getByText(/required|invalid|error/i).isVisible().catch(() => false);
    const disabled = await fp.submitButton.isDisabled().catch(() => false);
    expect(url.includes('/auth/forgot-password') || hasError || disabled).toBeTruthy();
  });

  test('should accept a valid email and submit without JS error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    const fp = new ForgotPasswordPage(page);
    await fp.goto();
    await fp.waitForForm();
    await fp.submit('test@example.com');
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
