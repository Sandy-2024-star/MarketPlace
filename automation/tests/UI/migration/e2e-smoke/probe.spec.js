// Probe spec: fetch all migrations and classify as file/api via entities[0].fromImportV2.
// Run: npx playwright test tests/UI/migration/e2e-smoke/probe.spec.js --retries=0 --workers=1

const { test } = require('../../../../fixtures/auth.fixture');
const config = require('../../../../utils/config');

test('build migration registry from API', async ({ request }) => {
  const loginRes = await request.post(`${config.apiURL}/auth/login`, {
    data: { username: config.username, password: config.password },
  });
  const { session } = await loginRes.json();
  const headers = { Authorization: `Session ${session}` };

  // Fetch all in one call
  const res = await request.get(
    `${config.serviceURL}/listings?type=migration&page=1&limit=200&sortBy=name&sortOrder=asc`,
    { headers }
  );
  const { data: listings } = await res.json();
  console.log(`\nTotal from API: ${listings.length}`);

  // Classify: fromImportV2=true on any entity → file-based, else api-based
  const results = listings.map(l => {
    const entities = l.entities || [];
    const isFile = entities.some(e => e.fromImportV2 === true);
    const dataTypes = [...new Set(entities.map(e => e.entityName).filter(Boolean))];
    return {
      name: l.name,
      id:   l.id,
      type: isFile ? 'file' : 'api',
      dataTypes,
    };
  });

  // Deduplicate (two "HubSpot to Salesforce" entries)
  const seen = new Set();
  const unique = results.filter(r => {
    const key = r.name;
    if (seen.has(key)) { console.log(`  ⚠ Duplicate: "${key}" (keeping first)`); return false; }
    seen.add(key);
    return true;
  });

  const files = unique.filter(r => r.type === 'file');
  const apis  = unique.filter(r => r.type === 'api');

  console.log(`\nFile-based: ${files.length} | API-based: ${apis.length} | Total unique: ${unique.length}`);

  console.log('\n=== ALL MIGRATIONS ===');
  unique.forEach(r =>
    console.log(`  [${r.type.padEnd(4)}] ${r.name}  →  [${r.dataTypes.join(', ')}]`)
  );

  console.log('\n============================================================');
  console.log('// PASTE THIS INTO migrations-registry.js');
  console.log('============================================================\n');
  console.log(`const MIGRATIONS = [`);
  unique.forEach(r => {
    const dt = r.dataTypes.map(d => `'${d}'`).join(', ');
    console.log(`  { card: '${r.name}', type: '${r.type}', id: '${r.id}', dataTypes: [${dt}] },`);
  });
  console.log(`];\n\nmodule.exports = MIGRATIONS;`);
  console.log('============================================================');
});
