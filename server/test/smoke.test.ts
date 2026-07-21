import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/index.js';

describe('app', () => {
  it('health returns ok', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
