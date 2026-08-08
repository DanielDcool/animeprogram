import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/index.js';

describe('app', () => {
  it('health returns ok', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('allows only configured browser origins', async () => {
    const app = await buildApp({ allowedOrigins: ['http://localhost:5173'] });

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://localhost:5173' },
    });
    const rejected = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://example-attacker.invalid' },
    });
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/settings',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PUT',
      },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-methods']).toContain('PUT');
    expect(preflight.headers['access-control-allow-methods']).toContain('DELETE');
  });
});
