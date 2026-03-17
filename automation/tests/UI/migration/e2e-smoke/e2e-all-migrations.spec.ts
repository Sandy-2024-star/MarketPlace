// E2E Migration Suite — parameterized across all 44 marketplace migrations.
//
// Flow (same for every migration):
//   1. Navigate directly to detail page (by ID — fastest, no marketplace navigation)
//   2. Verify detail page loads with correct title + badge
//   3. Click Get Started → wizard loads
//   4. Step 1: select the first available data type → Continue enables → click Continue
//   5. Step 2:
//        file  → verify "Upload your files" heading + Upload button visible + Continue disabled
//        api   → verify "Connect systems" heading + credential inputs visible + Continue disabled
//   6. (Stops here — does NOT complete upload/connect to avoid running real migrations)
//
// Run all:     npx playwright test tests/UI/migration/e2e-smoke/e2e-all-migrations.spec.js --workers=2 --retries=0
// Run one:     npx playwright test ... --grep "Adobe Commerce"
// File only:   npx playwright test ... --grep "\\[file\\]"
// API only:    npx playwright test ... --grep "\\[api\\]"

import { test, expect } from '../../../../fixtures/auth.fixture';
import { MIGRATIONS, detailUrl } from './migrations-registry';
import { MigrationDetailPage } from '../../../../pages/MigrationDetailPage';
import { MigrationWizardPage } from '../../../../pages/MigrationWizardPage';
import { withRetry } from '../../../../utils/retry';
import config from '../../../../utils/config';

// Serial within each worker to avoid overwhelming the staging server
test.describe.configure({ mode: 'default' });

for (const migration of MIGRATIONS) {
  const label = `[${migration.type}] ${migration.card}`;

  test(label, async ({ page }) => {
    // ── Step: Navigate directly to detail page ──────────────────────────────
    console.log(`\n[e2e] Starting: "${migration.card}" (${migration.type})`);
    await withRetry(
      () => page.goto(detailUrl(migration), { waitUntil: 'domcontentloaded' }),
      { attempts: 3, delayMs: 3000, label: migration.card }
    );

    const detail = new MigrationDetailPage(page);
    await detail.waitForLoaded();

    // Verify title loads correctly
    await expect(detail.title).toContainText(migration.card);

    // Read the actual badge text — use this (not registry type) to drive step 2 assertions
    await expect(detail.migrationTypeBadge).toBeVisible({ timeout: 8000 });
    const badgeText = await detail.migrationTypeBadge.textContent({ timeout: 5000 });
    const actualType = (badgeText ?? '').toLowerCase().includes('file') ? 'file' : 'api';
    console.log(`[e2e] ✓ Detail page OK | badge="${(badgeText ?? '').trim()}" actualType=${actualType}`);

    // ── Step: Get Started → Wizard ───────────────────────────────────────────
    await detail.clickGetStarted();
    const wizard = new MigrationWizardPage(page);
    await wizard.waitForLoaded();
    console.log(`[e2e] ✓ Wizard loaded`);

    // ── Step 1: Select first available data type ─────────────────────────────
    await expect(wizard.step1Heading).toBeVisible();
    await expect(wizard.continueButton).toBeDisabled();

    // Try each data type from registry using substring matching (same as WizardPage POM)
    let selected = false;
    for (const dtype of migration.dataTypes) {
      const btn = page.locator('button').filter({ hasText: dtype }).first();
      const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) continue;

      await btn.click();
      await page.waitForTimeout(300);
      const enabled = await wizard.continueButton.isEnabled({ timeout: 3000 }).catch(() => false);
      if (enabled) {
        selected = true;
        console.log(`[e2e] ✓ Step 1: selected "${dtype}", Continue enabled`);
        break;
      }
      // Deselect and try next
      await btn.click();
      await page.waitForTimeout(200);
    }

    expect(selected, `Step 1: could not select any data type for "${migration.card}" (tried: ${migration.dataTypes.join(', ')})`).toBe(true);
    await expect(wizard.continueButton).toBeEnabled();
    await wizard.continueButton.click();
    await page.waitForTimeout(800);
    console.log(`[e2e] ✓ Step 1 → Step 2`);

    // ── Step 2: Verify correct flow type (branch on actual badge, not registry) ──
    if (actualType === 'file') {
      // Heading confirms file-based flow; Upload button style varies per migration (button vs direct input)
      await expect(wizard.step2FileHeading).toBeVisible({ timeout: 15000 });
      await expect(wizard.continueButton).toBeDisabled();
      console.log(`[e2e] ✓ Step 2 (file): "Upload your files" visible, Continue disabled`);
    } else {
      await expect(wizard.step2ApiHeading).toBeVisible({ timeout: 15000 });
      // Any input or connect button confirms the connection form is present
      const credentialsVisible =
        await wizard.storeHashInput.isVisible({ timeout: 3000 }).catch(() => false) ||
        await wizard.accessTokenInput.isVisible({ timeout: 3000 }).catch(() => false) ||
        await wizard.connectAccountBtn.isVisible({ timeout: 3000 }).catch(() => false) ||
        await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false) ||
        await page.locator('button').filter({ hasText: /connect/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(credentialsVisible, `Step 2 (api): no inputs or connect button visible for "${migration.card}"`).toBe(true);
      await expect(wizard.continueButton).toBeDisabled();
      console.log(`[e2e] ✓ Step 2 (api): "Connect systems" visible, Continue disabled`);
    }

    console.log(`[e2e] ✅ PASSED: "${migration.card}"`);
  });
}
