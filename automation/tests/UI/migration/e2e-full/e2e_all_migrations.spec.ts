// E2E All Migrations — data-driven spec
//
// Runs every non-skipped entry from migrations.config.js through the generic runner.
// Skipped migrations are listed as test.skip so they appear in the report.
//
// Run all active:
//   npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --headed
//
// Run a specific migration by name (grep):
//   npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --headed --grep "GreenLine POS"
//
// Run a specific phase:
//   npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --headed --grep "phase:1"
//
// Filter by phase programmatically:
//   PHASE=1 npx playwright test --config tests/UI/migration/e2e-full/playwright.config.js --headed

import { test, expect } from '../../../../fixtures/auth.fixture';
import { runE2eMigration } from './runner';
import migrations from './migrations.config';

const PHASE_FILTER = (() => {
  if (!process.env.PHASE) return null;
  const n = parseInt(process.env.PHASE, 10);
  if (isNaN(n) || n < 1 || n > 4) throw new Error(`PHASE must be 1–4, got: "${process.env.PHASE}"`);
  return n;
})();

const active  = migrations.filter(m => !m.skip && (!PHASE_FILTER || m.phase === PHASE_FILTER));
const skipped = migrations.filter(m =>  m.skip && (!PHASE_FILTER || m.phase === PHASE_FILTER));

// ── Active migrations ────────────────────────────────────────────────────────

for (const migration of active) {
  test(`[phase:${migration.phase}] E2E – ${migration.card}`, async ({ page }) => {
    test.setTimeout(300000); // 5 min per migration

    const url = await runE2eMigration(page, migration);

    // In DRY_RUN the URL stays on the wizard/review page; in live mode it
    // redirects to a migration/project page — both are valid outcomes.
    expect(url).toMatch(/migration|project|listing|wizard/i);
  });
}

// ── Skipped migrations (visible in report) ───────────────────────────────────

for (const migration of skipped) {
  test.skip(`[phase:${migration.phase}] E2E – ${migration.card} — SKIP: ${migration.skip}`, async () => {});
}
