// Page Object Model – Landing / Marketing page

import type { Page, Locator } from '@playwright/test';
import config from '../utils/config';

export class LandingPage {
  readonly page: Page;
  readonly signInLink: Locator;
  readonly getStartedButton: Locator;
  readonly navIntegrations: Locator;
  readonly navFeatures: Locator;
  readonly navTestimonials: Locator;
  readonly startFreeMigration: Locator;
  readonly seeHowItWorks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.signInLink         = page.getByRole('link', { name: 'Sign in' });
    this.getStartedButton   = page.getByRole('link', { name: 'Get Started' });
    this.navIntegrations    = page.getByRole('link', { name: 'Integrations' });
    this.navFeatures        = page.getByRole('link', { name: 'Features' });
    this.navTestimonials    = page.getByRole('link', { name: 'Testimonials' });
    this.startFreeMigration = page.getByRole('link', { name: 'Start Free Migration' });
    this.seeHowItWorks      = page.getByRole('link', { name: 'See How It Works' });
  }

  async goto(): Promise<void> {
    await this.page.goto(config.baseURL, { waitUntil: 'networkidle' });
  }

  async goToLogin(): Promise<void> {
    await this.signInLink.click();
    await this.page.waitForURL('**/auth/login', { timeout: 15000 });
  }
}
