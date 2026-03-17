// API-based template inventory — fast alternative to the UI crawl in tests/marketplace/list_templates.spec.js.
// Fetches all listings in a single API call, derives migration type from entities[].fromImportV2:
//   fromImportV2: true  → "File Based"  (CSV export/upload flow)
//   fromImportV2: false → "API"          (direct API sync)
//
// Run: npx playwright test tests/api/list_templates.spec.js --project=chromium --reporter=list

import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import config from '../../utils/config';

const INVENTORY_FILE = path.resolve(__dirname, '../../test-results/inventory_api.json');

async function apiLogin(request: APIRequestContext) {
  const res = await request.post(`${config.apiURL}/auth/login`, {
    data: { username: config.username, password: config.password },
  });
  expect(res.status()).toBe(201);
  const { session } = await res.json();
  return session;
}

function headers(session: string) {
  return { Authorization: `Session ${session}` };
}

/**
 * Determine migration type badge from the entities array.
 * If all entities use fromImportV2=true → "File Based", otherwise "API".
 * Falls back to "Unknown" if entities is empty.
 */
function resolveMigrationType(entities: Array<{ fromImportV2?: boolean }>) {
  if (!entities || entities.length === 0) return 'Unknown';
  const allFileBased = entities.every(e => e.fromImportV2 === true);
  return allFileBased ? 'File Based' : 'API';
}

test.describe('Template Inventory API', () => {

  test('should fetch all templates in a single request', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings?page=1&limit=100&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pagination.totalCount).toBeGreaterThan(0);
    // Confirm we got everything in one shot
    expect(body.data.length).toBe(body.pagination.totalCount);
  });

  test('should have only migration and integration types', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings?page=1&limit=100&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    const { data } = await res.json();

    const types = [...new Set((data as any[]).map(i => i.type))];
    for (const t of types) {
      expect(['migration', 'integration']).toContain(t);
    }
  });

  test('should have at least one File Based and one API migration', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings?type=migration&page=1&limit=100&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    const { data } = await res.json();

    const migrationTypes = (data as any[]).map(i => resolveMigrationType(i.entities));
    expect(migrationTypes).toContain('File Based');
    expect(migrationTypes).toContain('API');
  });

  test('should have all required fields on every template', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings?page=1&limit=100&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    const { data } = await res.json();

    for (const item of data) {
      expect(item).toHaveProperty('id');
      expect(typeof item.id).toBe('string');
      expect(item).toHaveProperty('name');
      expect(typeof item.name).toBe('string');
      expect(item.name.length).toBeGreaterThan(0);
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('active');
      expect(Array.isArray(item.entities)).toBe(true);
      expect(item).toHaveProperty('pricing');
    }
  });

  test('should report duplicate template names', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings?page=1&limit=100&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    const { data } = await res.json();

    const names = (data as any[]).map((i: any) => i.name as string);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      console.log(`  ⚠ Duplicate template names (${duplicates.length}): ${duplicates.join(', ')}`);
    } else {
      console.log('  ✓ No duplicate template names');
    }
    // Known duplicates in staging: "HubSpot to Salesforce", "Shopify to Clover"
    // This test documents the count — update the expected value if staging data is cleaned up
    expect(duplicates.length).toBe(2);
  });

  test('should have all active templates marked active=true', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings?page=1&limit=100&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    const { data } = await res.json();

    const inactive = (data as any[]).filter(i => i.active !== true);
    if (inactive.length > 0) {
      console.log(`  ⚠ Inactive templates: ${inactive.map(i => i.name).join(', ')}`);
    }
    expect(inactive.length).toBe(0);
  });

  test('INVENTORY – build catalog, detect changes, save snapshot', async ({ request }) => {
    test.setTimeout(30000);

    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings?page=1&limit=100&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    expect(res.status()).toBe(200);
    const { data, pagination } = await res.json();

    // Build inventory: name → { migrationType, type, entities, pricing }
    const inventory: Record<string, any> = {};
    const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));

    console.log('\n=== Template Catalog (API) ===');
    for (const item of sorted) {
      const migrationType = resolveMigrationType(item.entities);
      inventory[item.name] = {
        id:            item.id,
        type:          item.type,
        migrationType: item.type === 'migration' ? migrationType : 'N/A',
        entityCount:   item.entities.length,
        pricingType:   item.pricing?.type ?? 'unknown',
        price:         item.pricing?.price ?? '?',
        tags:          item.tags ?? [],
      };
      const badge = item.type === 'migration' ? migrationType : item.type;
      console.log(`  [${badge}] ${item.name}  (${item.entities.length} entities, ${item.pricing?.price ?? '?'})`);
    }
    console.log(`=== Total: ${sorted.length} (pagination.totalCount=${pagination.totalCount}) ===\n`);

    // ── Diff against previous run ───────────────────────────────────────────
    let previous = null;
    try { previous = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8')); } catch {}

    if (previous) {
      const added   = sorted.filter(i => !(i.name in previous));
      const removed = Object.keys(previous).filter(n => !inventory[n]);
      const changed = sorted.filter(i => {
        const prev = previous[i.name];
        if (!prev) return false;
        return prev.migrationType !== inventory[i.name].migrationType ||
               prev.pricingType   !== inventory[i.name].pricingType;
      });

      if (added.length || removed.length || changed.length) {
        console.log('=== Changes since last run ===');
        added.forEach(i   => console.log(`  + ADDED:   ${i.name} [${inventory[i.name].migrationType}]`));
        removed.forEach(n => console.log(`  - REMOVED: ${n} [${previous[n].migrationType}]`));
        changed.forEach(i => {
          const p = previous[i.name];
          const c = inventory[i.name];
          if (p.migrationType !== c.migrationType)
            console.log(`  ~ CHANGED: ${i.name} migrationType: ${p.migrationType} → ${c.migrationType}`);
          if (p.pricingType !== c.pricingType)
            console.log(`  ~ CHANGED: ${i.name} pricingType: ${p.pricingType} → ${c.pricingType}`);
        });
        console.log(`=== ${added.length} added, ${removed.length} removed, ${changed.length} changed ===\n`);
      } else {
        console.log('=== No changes since last run ===\n');
      }
    } else {
      console.log('=== No previous snapshot — this is the baseline run ===\n');
    }

    // Save snapshot
    const outDir = path.dirname(INVENTORY_FILE);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2));
    console.log(`[inventory] Saved → ${INVENTORY_FILE}`);

    expect(sorted.length).toBe(pagination.totalCount);
  });
});
