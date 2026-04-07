import { test, expect } from '@playwright/test';

test.describe('API endpoints', () => {
  test('GET /api/health returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('GET /api/mission-control/board returns board data', async ({ request }) => {
    const res = await request.get('/api/mission-control/board');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('jobs');
    expect(body).toHaveProperty('teams');
    expect(body).toHaveProperty('orchestrator');
    expect(Array.isArray(body.agents)).toBe(true);
  });

  test('GET /api/teams/config returns team configuration', async ({ request }) => {
    const res = await request.get('/api/teams/config');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('name');
    expect(body[0]).toHaveProperty('category');
  });

  test('GET /api/teams/factory-floor returns department data', async ({ request }) => {
    const res = await request.get('/api/teams/factory-floor');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('agentCount');
  });

  test('GET /api/events returns events array', async ({ request }) => {
    const res = await request.get('/api/events');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/settings returns settings array', async ({ request }) => {
    const res = await request.get('/api/settings');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/teams/config with duplicate name returns 400', async ({ request }) => {
    const res = await request.post('/api/teams/config', {
      data: { name: 'Orchestration', category: 'general' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already exists');
  });
});
