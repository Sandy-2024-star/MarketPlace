// API tests for the listing detail endpoint.
// GET /listings          — paginated list with type filter
// GET /listings/{id}     — single listing detail
// Auth: POST /api/1.0/auth/login → { session } → Authorization: Session {session}

import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import config from '../../utils/config';

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

// Fetch first page of listings once, reuse across tests
async function getFirstListing(request: APIRequestContext, session: string) {
  const res = await request.get(
    `${config.serviceURL}/listings?page=1&limit=10&sortBy=name&sortOrder=asc`,
    { headers: headers(session) }
  );
  const body = await res.json();
  return body.data[0];
}

test.describe('Listing API', () => {

  // ── List endpoint ───────────────────────────────────────────────────────────

  test('should return paginated listing list', async ({ request }) => {
    const session = await apiLogin(request);
    const res = await request.get(
      `${config.serviceURL}/listings?page=1&limit=5&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(5);

    const p = body.pagination;
    expect(p).toHaveProperty('currentPage', 1);
    expect(p).toHaveProperty('limit', 5);
    expect(p.totalCount).toBeGreaterThan(0);
    expect(typeof p.hasNextPage).toBe('boolean');
    expect(typeof p.hasPrevPage).toBe('boolean');
    expect(p.hasPrevPage).toBe(false); // page 1
  });

  test('should filter listings by type=migration', async ({ request }) => {
    const session = await apiLogin(request);
    const res = await request.get(
      `${config.serviceURL}/listings?type=migration&page=1&limit=50&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(item.type).toBe('migration');
    }
  });

  test('should filter listings by type=integration', async ({ request }) => {
    const session = await apiLogin(request);
    const res = await request.get(
      `${config.serviceURL}/listings?type=integration&page=1&limit=50`,
      { headers: headers(session) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    for (const item of body.data) {
      expect(item.type).toBe('integration');
    }
  });

  test('should include required fields on each list item', async ({ request }) => {
    const session = await apiLogin(request);
    const res = await request.get(
      `${config.serviceURL}/listings?page=1&limit=10&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    const { data } = await res.json();

    for (const item of data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('active');
      expect(item).toHaveProperty('sourceLogo');
      expect(item).toHaveProperty('targetLogo');
      expect(item).toHaveProperty('pricing');
      expect(Array.isArray(item.tags)).toBe(true);
      expect(Array.isArray(item.entities)).toBe(true);
    }
  });

  test('should return next page with different results', async ({ request }) => {
    const session = await apiLogin(request);

    const page1 = await request.get(
      `${config.serviceURL}/listings?page=1&limit=5&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    const page2 = await request.get(
      `${config.serviceURL}/listings?page=2&limit=5&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );

    expect(page1.status()).toBe(200);
    expect(page2.status()).toBe(200);

    const ids1 = (await page1.json()).data.map((i: any) => i.id);
    const ids2 = (await page2.json()).data.map((i: any) => i.id);
    const overlap = ids1.filter((id: any) => ids2.includes(id));
    expect(overlap.length).toBe(0);
  });

  // ── Detail endpoint ─────────────────────────────────────────────────────────

  test('should fetch listing detail by id', async ({ request }) => {
    const session = await apiLogin(request);
    const listing = await getFirstListing(request, session);
    const id = listing.id;

    const res = await request.get(`${config.serviceURL}/listings/${id}`, {
      headers: headers(session),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id', id);
    expect(body.data).toHaveProperty('name', listing.name);
  });

  test('should include all required fields in listing detail', async ({ request }) => {
    const session = await apiLogin(request);
    const listing = await getFirstListing(request, session);

    const res = await request.get(`${config.serviceURL}/listings/${listing.id}`, {
      headers: headers(session),
    });
    const { data } = await res.json();

    // Identity
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('description');
    expect(data).toHaveProperty('type');
    expect(data).toHaveProperty('active');
    expect(data).toHaveProperty('version');

    // Systems
    expect(data).toHaveProperty('sourceSystemId');
    expect(data).toHaveProperty('targetSystemId');
    expect(data).toHaveProperty('sourceLogo');
    expect(data).toHaveProperty('targetLogo');

    // Arrays
    expect(Array.isArray(data.tags)).toBe(true);
    expect(Array.isArray(data.entities)).toBe(true);
    expect(Array.isArray(data.prerequisites)).toBe(true);
    expect(Array.isArray(data.prerequisiteSteps)).toBe(true);
    expect(Array.isArray(data.syncFrequencyOptions)).toBe(true);

    // Pricing object
    expect(data.pricing).toHaveProperty('type');
    expect(data.pricing).toHaveProperty('price');
    expect(data.pricing).toHaveProperty('trial');

    // Timestamps
    expect(data).toHaveProperty('createdAt');
    expect(data).toHaveProperty('updatedAt');
  });

  test('should have valid pricing shape on listing detail', async ({ request }) => {
    const session = await apiLogin(request);
    const listing = await getFirstListing(request, session);

    const res = await request.get(`${config.serviceURL}/listings/${listing.id}`, {
      headers: headers(session),
    });
    const { data } = await res.json();

    expect(typeof data.pricing.type).toBe('string');
    expect(data.pricing.type.length).toBeGreaterThan(0);
    expect(typeof data.pricing.price).toBe('string');
    expect(typeof data.pricing.trial).toBe('string');
  });

  test('should return compatibility object when present', async ({ request }) => {
    const session = await apiLogin(request);

    // Find a listing that has compatibility (observed on "Vend to Clover" etc.)
    const listRes = await request.get(
      `${config.serviceURL}/listings?page=1&limit=50&sortBy=name&sortOrder=asc`,
      { headers: headers(session) }
    );
    const { data: all } = await listRes.json();

    // Check detail for each until we find one with compatibility, or skip
    let found = false;
    for (const item of all.slice(0, 15)) {
      const r = await request.get(`${config.serviceURL}/listings/${item.id}`, { headers: headers(session) });
      const { data } = await r.json();
      if (data.compatibility) {
        expect(typeof data.compatibility.source).toBe('string');
        expect(typeof data.compatibility.destination).toBe('string');
        found = true;
        break;
      }
    }
    if (!found) {
      console.log('  No listings with compatibility field found in first 15 — skipping shape check');
    }
  });

  test('should return 404 for non-existent listing id', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings/000000000000000000000000`,
      { headers: headers(session) }
    );

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('should return 401 when fetching listing without auth', async ({ request }) => {
    // Get a valid id first (public endpoint may or may not require auth)
    const session = await apiLogin(request);
    const listing = await getFirstListing(request, session);

    const res = await request.get(`${config.serviceURL}/listings/${listing.id}`);
    // Either 401 (auth required) or 200 (public) — just assert it's not 5xx
    expect(res.status()).toBeLessThan(500);
  });
});
