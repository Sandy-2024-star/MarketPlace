// Sign Up UI tests — /auth/signup
// Covers: form fields visibility, navigation, validation.

const { test, expect } = require('@playwright/test');
const SignUpPage = require('../../../pages/SignUpPage');
const LoginPage = require('../../../pages/LoginPage');
const config = require('../../../utils/config');

test.describe('Sign Up UI', () => {
  test('should show all sign-up form fields and Verify email button', async ({ page }) => {
    const signup = new SignUpPage(page);
    await signup.goto();
    await signup.waitForForm();
    await expect(signup.emailInput).toBeVisible();
    await expect(signup.usernameInput).toBeVisible();
    await expect(signup.passwordInput).toBeVisible();
    await expect(signup.confirmPassInput).toBeVisible();
    await expect(signup.verifyEmailButton).toBeVisible();
  });

  test('should navigate to sign-up page via "Sign Up here" link on login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.waitForForm();
    await login.signUpLink.click();
    await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 15000 });
  });

  test('should have a Login back-link on the sign-up page', async ({ page }) => {
    const signup = new SignUpPage(page);
    await signup.goto();
    await signup.waitForForm();
    await expect(signup.loginLink).toBeVisible();
  });

  test('should keep Verify email button disabled or show error when fields are empty', async ({ page }) => {
    const signup = new SignUpPage(page);
    await signup.goto();
    await signup.waitForForm();
    await signup.verifyEmailButton.click();
    await page.waitForTimeout(1000);
    const isDisabled = await signup.verifyEmailButton.isDisabled().catch(() => false);
    const hasError   = await page.getByText(/required|invalid|error/i).isVisible().catch(() => false);
    const stayedOnPage = page.url().includes('/auth/signup');
    expect(isDisabled || hasError || stayedOnPage).toBeTruthy();
  });

  test('should reject mismatched passwords and stay on sign-up page', async ({ page }) => {
    const signup = new SignUpPage(page);
    await signup.goto();
    await signup.waitForForm();
    await signup.fillAndSubmit({
      email:           'test@example.com',
      username:        'testuser',
      name:            'Test User',
      password:        'Password123!',
      confirmPassword: 'DifferentPass456!',
    });
    await page.waitForTimeout(1500);
    const url      = page.url();
    const hasError = await page.getByText(/match|password|error/i).isVisible().catch(() => false);
    expect(url.includes('/auth/signup') || hasError).toBeTruthy();
  });
});
