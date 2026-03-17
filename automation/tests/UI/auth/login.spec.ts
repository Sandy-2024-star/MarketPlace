// Login UI tests — /auth/login
// Covers: form visibility, successful login, invalid credentials, nav links.

import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import config from '../../../utils/config';

test.describe('Login UI', () => {
  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.waitForForm();
  });

  test('should show login form with username, password and Confirm button', async ({ page }) => {
    const login = new LoginPage(page);
    await expect(login.usernameInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.confirmButton).toBeVisible();
  });

  test('should login successfully and redirect to marketplace', async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(config.username, config.password);
    await expect(page).toHaveURL(/\/listings/, { timeout: 30000 });
  });

  test('should show error on invalid credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.login('invalid_user', 'wrong_password');
    // Should stay on login page or show error
    await page.waitForTimeout(2000);
    const url = page.url();
    const hasError = await page.getByText(/invalid|incorrect|error|wrong/i).isVisible().catch(() => false);
    expect(url.includes('/auth/login') || hasError).toBeTruthy();
  });

  test('should have a Forgot password link', async ({ page }) => {
    const login = new LoginPage(page);
    await expect(login.forgotPasswordLink).toBeVisible();
    const href = await login.forgotPasswordLink.getAttribute('href');
    expect(href).toContain('forgot-password');
  });

  test('should have a Sign Up link', async ({ page }) => {
    const login = new LoginPage(page);
    await expect(login.signUpLink).toBeVisible();
  });
});
