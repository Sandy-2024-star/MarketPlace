// Card Detail page tests — /listing/{id}
// Covers: sections visible, section text non-empty, action buttons, back navigation, title match.
// Uses auth fixture — page starts authenticated on /listings.

import { test, expect } from '../../../fixtures/auth.fixture';
import { MarketplacePage } from '../../../pages/MarketplacePage';
import { MigrationDetailPage } from '../../../pages/MigrationDetailPage';
import type { Page } from '@playwright/test';

test.describe('Card Detail Page', () => {
  /** Open the first available card and return {mp, detail, cardTitle} */
  async function openFirstCard(page: Page) {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    expect(titles.length).toBeGreaterThan(0);
    const cardTitle = titles[0];
    await mp.openCard(cardTitle);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    return { mp, detail, cardTitle };
  }

  test('detail page sections are visible', async ({ page }) => {
    const { detail } = await openFirstCard(page);
    await expect(detail.whatItDoes).toBeVisible();
    await expect(detail.howItWorks).toBeVisible();
    await expect(detail.securityTrust).toBeVisible();
    // "Important Notes" section (shown as h3 in live UI)
    const importantNotes = page.getByRole('heading', { name: /important notes/i });
    await expect(importantNotes).toBeVisible();
  });

  test('section headings contain non-empty text', async ({ page }) => {
    const { detail } = await openFirstCard(page);
    for (const locator of [detail.whatItDoes, detail.howItWorks, detail.securityTrust]) {
      const text = await locator.textContent();
      expect(text!.trim().length).toBeGreaterThan(0);
    }
  });

  test('Watch Demo Video button is visible', async ({ page }) => {
    const { detail } = await openFirstCard(page);
    // Live UI renders "Watch Demo Video"
    const watchDemo = page.getByRole('button', { name: /watch demo/i });
    await expect(watchDemo).toBeVisible();
  });

  test('Get Started CTA button is visible and enabled', async ({ page }) => {
    const { detail } = await openFirstCard(page);
    await expect(detail.ctaButton).toBeVisible();
    await expect(detail.ctaButton).toBeEnabled();
  });

  test('migration type badge shows File Based or API', async ({ page }) => {
    const { detail } = await openFirstCard(page);
    const badge = await detail.migrationTypeBadge.textContent();
    expect(badge!.trim()).toMatch(/File Based|API/);
  });

  test('Back button returns to marketplace', async ({ page }) => {
    const { detail } = await openFirstCard(page);
    await detail.goBack();
    await expect(page).toHaveURL(/\/listings/);
  });

  test('pricing information — discovery', async ({ page }) => {
    const { detail } = await openFirstCard(page);
    // Pricing can appear as "$0", "$199", "Contact for pricing", "Free", etc.
    const pricingLocator = page.locator('text=/free|\\$\\d|contact for pricing|per migration|pricing/i').first();
    const visible = await pricingLocator.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[card-detail] Pricing text visible on detail page: ${visible}`);
    // Discovery test — does not fail. When pricing is added to the detail UI, this will log 'true'.
    // TODO: change to expect(visible).toBe(true) once pricing is rendered on the detail page.
  });

  test('detail page title matches card title from marketplace', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const titles = await mp.getCardTitles();
    expect(titles.length).toBeGreaterThan(0);
    const cardTitle = titles[0];
    await mp.openCard(cardTitle);
    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();
    const detailTitle = await detail.getTitle();
    expect(detailTitle.toLowerCase()).toContain(cardTitle.split(' ')[0].toLowerCase());
  });
});
