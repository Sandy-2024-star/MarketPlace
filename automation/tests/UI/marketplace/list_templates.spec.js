// Template inventory probe — lists all migration templates and their types.
// Writes a snapshot to test-results/inventory.json for dashboard use.
// Uses auth fixture — page starts authenticated on /listings.

const { test, expect } = require('../../../fixtures/auth.fixture');
const MarketplacePage = require('../../../pages/MarketplacePage');
const MigrationDetailPage = require('../../../pages/MigrationDetailPage');
const config = require('../../../utils/config');
const fs = require('fs');
const path = require('path');

test.describe.configure({ mode: 'serial' });

test('INVENTORY – list migration templates and type', async ({ page }) => {
  test.setTimeout(360000);

  const mp = new MarketplacePage(page);
  await mp.setItemsPerPage('100');

  const allCards = [];
  let pageNum = 1;

  // Collect cards across all pages
  while (true) {
    const titles = await mp.getCardTitles();
    console.log(`[inventory] Page ${pageNum} — ${titles.length} cards`);
    for (const title of titles) {
      allCards.push({ title, type: null });
    }

    const nextEnabled = await mp.nextButton.isEnabled().catch(() => false);
    if (!nextEnabled) break;
    await mp.goToNextPage();
    pageNum++;
  }

  console.log(`[inventory] Total cards found: ${allCards.length}`);
  expect(allCards.length).toBeGreaterThan(0);

  // Visit each card detail to get the migration type badge
  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i];
    console.log(`[inventory] [${i + 1}/${allCards.length}] "${card.title}"`);
    try {
      await page.goto(`${config.baseURL}/listings`, { waitUntil: 'domcontentloaded' });
      await mp.waitForLoaded();
      if (allCards.length > 10) await mp.setItemsPerPage('100');
      await mp.openCard(card.title);
      const detail = new MigrationDetailPage(page);
      await detail.waitForLoaded();
      const badge = await detail.migrationTypeBadge.textContent().catch(() => '');
      card.type = badge.trim() || 'Unknown';
    } catch (err) {
      console.warn(`[inventory] ⚠ Failed to get type for "${card.title}": ${err.message}`);
      card.type = 'Unknown';
    }
  }

  // Save snapshot
  const outDir  = path.resolve(__dirname, '../../../test-results');
  const outFile = path.join(outDir, 'inventory.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ capturedAt: new Date().toISOString(), cards: allCards }, null, 2));
  console.log(`[inventory] ✓ Saved ${allCards.length} cards → ${outFile}`);

  // Log summary
  const fileBased = allCards.filter(c => c.type === 'File Based').length;
  const api       = allCards.filter(c => c.type === 'API').length;
  const unknown   = allCards.filter(c => c.type === 'Unknown').length;
  console.log(`[inventory] File Based: ${fileBased} | API: ${api} | Unknown: ${unknown}`);
});
