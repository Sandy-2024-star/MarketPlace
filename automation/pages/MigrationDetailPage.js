// Page Object Model – Migration Template Detail page
// URL: /listing/{id}
// Real selectors validated from live UI

const BasePage = require('./BasePage');
const config = require('../utils/config');

class MigrationDetailPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // Top nav
    this.backButton        = page.getByRole('button', { name: 'Back' })
      .or(page.getByRole('link', { name: 'Back' })).first();
    this.myProjectsLink    = page.getByRole('button', { name: 'My Projects' })
      .or(page.getByRole('link', { name: 'My Projects' }));

    // Hero
    this.title                 = page.locator('h1');
    // Migration templates show "Get Started"; Integration templates show "Set up Integration"
    this.getStartedButton      = page.getByRole('button', { name: 'Get Started' });
    this.setUpIntegrationButton= page.getByRole('button', { name: 'Set up Integration' });
    this.ctaButton             = page.getByRole('button', { name: /^(Get Started|Set up Integration)$/ });
    this.watchDemoButton       = page.getByRole('button', { name: /watch demo/i }).or(page.getByRole('link', { name: /watch demo/i }));
    this.submitIssueButton     = page.getByRole('button', { name: /submit issue/i });
    this.giveFeedbackButton    = page.getByRole('button', { name: /give feedback/i });

    // Migration type badge — "File Based" or "API"
    this.migrationTypeBadge = page.locator('span, div').filter({ hasText: /^(File Based|API)$/ }).first();

    // Sections (confirmed h2/h3 structure)
    this.whatItDoes        = page.getByRole('heading', { name: 'What This Migration Does' });
    this.howItWorks        = page.getByRole('heading', { name: 'How It Works' });
    this.preRequisites     = page.getByRole('heading', { name: 'Pre-Requisites' });
    this.securityTrust     = page.getByRole('heading', { name: 'Security & Trust' });
  }

  /** Wait for migration details to fully load */
  async waitForLoaded() {
    console.log('[detail] Waiting for detail page...');
    await this.page.locator('text=Loading migration details...').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await this.title.waitFor({ state: 'visible', timeout: 20000 });
    const hasCTA = await this.ctaButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    const titleText = await this.title.textContent().catch(() => '?');
    const badge     = await this.migrationTypeBadge.textContent().catch(() => '?');
    const ctaText   = hasCTA ? await this.ctaButton.textContent().catch(() => '?') : null;
    if (!hasCTA) console.log(`[detail] ⚠ No CTA button found — card may be incomplete`);
    console.log(`[detail] ✓ Loaded — "${titleText.trim()}" | type: ${badge.trim()}${ctaText ? ` | cta: "${ctaText.trim()}"` : ''}`);
  }

  /** Get the migration title text */
  async getTitle() {
    return (await this.title.textContent()).trim();
  }

  /** Click the primary CTA ("Get Started" for migrations, "Set up Integration" for integrations) */
  async clickGetStarted() {
    const ctaText = await this.ctaButton.textContent().catch(() => 'Get Started');
    console.log(`[detail] Clicking "${ctaText.trim()}"...`);
    await this.ctaButton.click();
    await this.page.waitForLoadState('networkidle');
    console.log('[detail] ✓ Flow launched. URL:', this.page.url());
  }

  /** Click Back to return to the Marketplace */
  async goBack() {
    console.log('[detail] Going back to Marketplace...');
    await this.backButton.click();
    await this.page.waitForURL(/\/listings/, { timeout: 15000 });
    console.log('[detail] ✓ Back on Marketplace');
  }
}

module.exports = MigrationDetailPage;
