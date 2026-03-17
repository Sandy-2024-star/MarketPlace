// Page Object Model – Sign Up page

import type { Page, Locator } from '@playwright/test';
import config from '../utils/config';

interface SignUpData {
  email: string;
  username: string;
  name: string;
  password: string;
  confirmPassword: string;
}

export class SignUpPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly usernameInput: Locator;
  readonly nameInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPassInput: Locator;
  readonly verifyEmailButton: Locator;
  readonly loginLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput        = page.locator('input[name="email"]');
    this.usernameInput     = page.locator('input[name="username"]');
    this.nameInput         = page.locator('input[name="name"]');
    this.passwordInput     = page.locator('input[name="password"]');
    this.confirmPassInput  = page.locator('input[name="confirmPassword"]');
    this.verifyEmailButton = page.getByRole('button', { name: /verify email/i });
    this.loginLink         = page.getByRole('link', { name: 'Login' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${config.baseURL}/auth/signup`, { waitUntil: 'networkidle' });
  }

  async waitForForm(): Promise<void> {
    await this.emailInput.waitFor({ state: 'visible', timeout: config.defaultTimeout });
  }

  async fillAndSubmit({ email, username, name, password, confirmPassword }: SignUpData): Promise<void> {
    await this.emailInput.fill(email);
    await this.usernameInput.fill(username);
    await this.nameInput.fill(name);
    await this.passwordInput.fill(password);
    await this.confirmPassInput.fill(confirmPassword);
    await this.verifyEmailButton.click();
  }
}
