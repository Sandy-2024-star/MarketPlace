// Page Object Model – Forgot Password page
// URL: /auth/forgot-password
// Selectors validated against live app via probe.

const config = require('../utils/config');

class ForgotPasswordPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    this.emailInput    = page.locator('input[name="email"]');
    this.submitButton  = page.getByRole('button', { name: /submit/i });
  }

  /** Navigate directly to the forgot-password page */
  async goto() {
    await this.page.goto(`${config.baseURL}/auth/forgot-password`, { waitUntil: 'networkidle' });
  }

  /** Wait until the form is ready */
  async waitForForm() {
    await this.emailInput.waitFor({ state: 'visible', timeout: config.defaultTimeout });
  }

  /**
   * Fill the email field and submit.
   * @param {string} email
   */
  async submit(email) {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }
}

module.exports = ForgotPasswordPage;
