// API tests for authentication endpoint.
// Confirmed endpoint: POST /api/1.0/auth/login → 201 { session: "..." }

import { test, expect } from '@playwright/test';
import config from '../../utils/config';

test.describe('Auth API', () => {
  test('should login and return a session token', async ({ request }) => {
    const response = await request.post(`${config.apiURL}/auth/login`, {
      data: {
        username: config.username,
        password: config.password,
      },
    });

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body).toHaveProperty('session');
    expect(typeof body.session).toBe('string');
    expect(body.session.length).toBeGreaterThan(0);
  });

  test('should reject invalid credentials with 422', async ({ request }) => {
    const response = await request.post(`${config.apiURL}/auth/login`, {
      data: { username: 'invalid_user', password: 'wrong_pass' },
    });

    // Server returns 422 with an HTML error page for invalid credentials
    expect(response.status()).toBe(422);
  });
});
