// API tests for marketplace listings.
// Auth: POST /api/1.0/auth/login → { session } → header: Authorization: Session {session}
// Base: /api/1.0/standalone-flow-marketplace-backend-service

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

function authHeaders(session: string) {
  return { Authorization: `Session ${session}` };
}

test.describe('Marketplace API', () => {
  test('should fetch listings with pagination', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(
      `${config.serviceURL}/listings?type=migration&page=1&limit=10&sortBy=name&sortOrder=asc`,
      { headers: authHeaders(session) }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('should fetch a listing by id', async ({ request }) => {
    const session = await apiLogin(request);

    // Get first listing id
    const listRes = await request.get(
      `${config.serviceURL}/listings?type=migration&page=1&limit=10&sortBy=name&sortOrder=asc`,
      { headers: authHeaders(session) }
    );
    const { data } = await listRes.json();
    const id = data[0]._id || data[0].id;

    const res = await request.get(`${config.serviceURL}/listings/${id}`, {
      headers: authHeaders(session),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('name');
  });

  test('should fetch all systems', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(`${config.serviceURL}/systems`, {
      headers: authHeaders(session),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('should fetch authenticated user info', async ({ request }) => {
    const session = await apiLogin(request);

    const res = await request.get(`${config.apiURL}/user/get-authenticated`, {
      headers: authHeaders(session),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('username');
    expect(body.username).toBe(config.username);
  });
});
