// Page Object Model – Forgot Password page

import type { Page, Locator } from '@playwright/test';
import config from '../utils/config';

export class ForgotPasswordPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput   = page.locator('input[name="email"]');
    this.submitButton = page.getByRole('button', { name: /submit/i });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${config.baseURL}/auth/forgot-password`, { waitUntil: 'networkidle' });
  }

  async waitForForm(): Promise<void> {
    await this.emailInput.waitFor({ state: 'visible', timeout: config.defaultTimeout });
  }

  async submit(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }
}
