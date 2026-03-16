// Marketplace pagination tests — page navigation + items-per-page control.
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage = require('../../../pages/MarketplacePage');

test.describe('Marketplace Pagination', () => {
  test('should show 10 cards on the first page by default', async ({ page }) => {
    const count = await page.locator('h3').count();
    expect(count).toBeLessThanOrEqual(10);
    expect(count).toBeGreaterThan(0);
  });

  test('should disable the Previous button on page 1', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await expect(mp.previousButton).toBeDisabled();
  });

  test('should enable the Next button on page 1', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await expect(mp.nextButton).toBeEnabled();
  });

  test('should navigate to page 2 with different cards', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const page1Titles = await mp.getCardTitles();
    await mp.goToNextPage();
    const page2Titles = await mp.getCardTitles();
    expect(page2Titles.length).toBeGreaterThan(0);
    expect(page2Titles).not.toEqual(page1Titles);
  });

  test('should show page indicator as "Page 2" after clicking Next', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToNextPage();
    const indicator = await mp.pageIndicator.textContent().catch(() => '');
    expect(indicator.toLowerCase()).toContain('2');
  });

  test('should enable Previous button on page 2', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.goToNextPage();
    await expect(mp.previousButton).toBeEnabled();
  });

  test('should navigate back to page 1 via Previous button', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const page1Titles = await mp.getCardTitles();
    await mp.goToNextPage();
    await mp.goToPreviousPage();
    const backTitles = await mp.getCardTitles();
    expect(backTitles).toEqual(page1Titles);
  });

  test('should show items-per-page combobox with default value "10"', async ({ page }) => {
    const mp = new MarketplacePage(page);
    const trigger = mp.itemsPerPageTrigger;
    await expect(trigger).toBeVisible();
    const text = await trigger.textContent().catch(() => '');
    expect(text.trim()).toBe('10');
  });

  test('should open items-per-page combobox and show 10/20/50/100 options', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.itemsPerPageTrigger.click({ force: true });
    await page.waitForTimeout(500);
    for (const val of ['10', '20', '50', '100']) {
      const opt = page.getByRole('option', { name: val, exact: true });
      const visible = await opt.isVisible().catch(() => false);
      if (!visible) {
        // Try listbox approach
        const li = page.locator(`[role="listbox"] [role="option"]:has-text("${val}")`);
        await expect(li.or(opt)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should show 20 cards when items-per-page is set to 20', async ({ page }) => {
    const mp = new MarketplacePage(page);
    await mp.setItemsPerPage('20');
    const count = await page.locator('h3').count();
    expect(count).toBeLessThanOrEqual(20);
    expect(count).toBeGreaterThan(10);
  });
});
