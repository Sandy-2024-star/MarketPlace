// Page Object Model – Migration Template Detail page
// URL: /listing/{id}

import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class MigrationDetailPage extends BasePage {
  readonly backButton: Locator;
  readonly myProjectsLink: Locator;
  readonly title: Locator;
  readonly getStartedButton: Locator;
  readonly setUpIntegrationButton: Locator;
  readonly ctaButton: Locator;
  readonly watchDemoButton: Locator;
  readonly submitIssueButton: Locator;
  readonly giveFeedbackButton: Locator;
  readonly migrationTypeBadge: Locator;
  readonly whatItDoes: Locator;
  readonly howItWorks: Locator;
  readonly preRequisites: Locator;
  readonly securityTrust: Locator;

  constructor(page: Page) {
    super(page);
    this.backButton             = page.getByRole('button', { name: 'Back' }).or(page.getByRole('link', { name: 'Back' })).first();
    this.myProjectsLink         = page.getByRole('button', { name: 'My Projects' }).or(page.getByRole('link', { name: 'My Projects' }));
    this.title                  = page.locator('h1');
    this.getStartedButton       = page.getByRole('button', { name: 'Get Started' });
    this.setUpIntegrationButton = page.getByRole('button', { name: 'Set up Integration' });
    this.ctaButton              = page.getByRole('button', { name: /^(Get Started|Set up Integration)$/ });
    this.watchDemoButton        = page.getByRole('button', { name: /watch demo/i }).or(page.getByRole('link', { name: /watch demo/i }));
    this.submitIssueButton      = page.getByRole('button', { name: /submit issue/i });
    this.giveFeedbackButton     = page.getByRole('button', { name: /give feedback/i });
    this.migrationTypeBadge     = page.locator('span, div').filter({ hasText: /^(File Based|API)$/ }).first();
    this.whatItDoes             = page.getByRole('heading', { name: 'What This Migration Does' });
    this.howItWorks             = page.getByRole('heading', { name: 'How It Works' });
    this.preRequisites          = page.getByRole('heading', { name: 'Pre-Requisites' });
    this.securityTrust          = page.getByRole('heading', { name: 'Security & Trust' });
  }

  async waitForLoaded(): Promise<void> {
    console.log('[detail] Waiting for detail page...');
    await this.page.locator('text=Loading migration details...').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await this.title.waitFor({ state: 'visible', timeout: 20000 });
    const hasCTA    = await this.ctaButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    const titleText = await this.title.textContent().catch(() => '?');
    const badge     = await this.migrationTypeBadge.textContent().catch(() => '?');
    const ctaText   = hasCTA ? await this.ctaButton.textContent().catch(() => '?') : null;
    if (!hasCTA) console.log('[detail] ⚠ No CTA button found — card may be incomplete');
    console.log(`[detail] ✓ Loaded — "${titleText?.trim()}" | type: ${badge?.trim()}${ctaText ? ` | cta: "${ctaText?.trim()}"` : ''}`);
  }

  async getTitle(): Promise<string> {
    return ((await this.title.textContent()) ?? '').trim();
  }

  async clickGetStarted(): Promise<void> {
    const ctaText = await this.ctaButton.textContent().catch(() => 'Get Started');
    console.log(`[detail] Clicking "${ctaText?.trim()}"...`);
    await this.ctaButton.click();
    await this.page.waitForLoadState('networkidle');
    console.log('[detail] ✓ Flow launched. URL:', this.page.url());
  }

  async goBack(): Promise<void> {
    console.log('[detail] Going back to Marketplace...');
    await this.backButton.click();
    await this.page.waitForURL(/\/listings/, { timeout: 15000 });
    console.log('[detail] ✓ Back on Marketplace');
  }
}
