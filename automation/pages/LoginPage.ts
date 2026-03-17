// Page Object Model – Login page

import type { Page, Locator } from '@playwright/test';
import config from '../utils/config';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signUpLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput      = page.getByPlaceholder('Enter your username');
    this.passwordInput      = page.getByPlaceholder('Enter your password');
    this.confirmButton      = page.getByRole('button', { name: 'Confirm' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
    this.signUpLink         = page.getByRole('link', { name: 'Sign Up here' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${config.baseURL}/auth/login`, { waitUntil: 'networkidle' });
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.confirmButton.click();
  }

  async waitForForm(): Promise<void> {
    await this.usernameInput.waitFor({ state: 'visible' });
  }
}
