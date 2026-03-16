// Page Object Model – Landing / Marketing page
// Real selectors validated against https://marketplace.flow.staging.linktoany.com/landing

const config = require('../utils/config');

class LandingPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Nav
    this.signInLink          = page.getByRole('link', { name: 'Sign in' });
    this.getStartedButton    = page.getByRole('link', { name: 'Get Started' });
    this.navIntegrations     = page.getByRole('link', { name: 'Integrations' });
    this.navFeatures         = page.getByRole('link', { name: 'Features' });
    this.navTestimonials     = page.getByRole('link', { name: 'Testimonials' });

    // Hero CTAs
    this.startFreeMigration  = page.getByRole('link', { name: 'Start Free Migration' });
    this.seeHowItWorks       = page.getByRole('link', { name: 'See How It Works' });
  }

  /** Navigate to the landing page */
  async goto() {
    await this.page.goto(config.baseURL, { waitUntil: 'networkidle' });
  }

  /** Click Sign In and wait for the login page to load */
  async goToLogin() {
    await this.signInLink.click();
    await this.page.waitForURL('**/auth/login', { timeout: 15000 });
  }
}

module.exports = LandingPage;
