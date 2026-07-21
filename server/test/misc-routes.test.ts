import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createDb } from '../src/db.js';
import { miscRoutes } from '../src/modules/misc/routes.js';

function makeApp(db = createDb(':memory:')) {
  const app = Fastify();
  app.register(miscRoutes, { db });
  return { app, db };
}

describe('progress', () => {
  it('upserts position', async () => {
    const { app, db } = makeApp();
    const id = db.prepare(`INSERT INTO media (series, file_path) VALUES ('A','/a')`).run().lastInsertRowid;
    await app.inject({ method: 'PUT', url: `/api/media/${id}/progress`, payload: { positionSec: 12.5 } });
    await app.inject({ method: 'PUT', url: `/api/media/${id}/progress`, payload: { positionSec: 99 } });
    const row: any = db.prepare('SELECT position_sec FROM progress WHERE media_id=?').get(id);
    expect(row.position_sec).toBe(99);
  });
});

describe('settings', () => {
  it('PUT then GET, api key masked in GET', async () => {
    const { app } = makeApp();
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { anthropic_api_key: 'sk-ant-xyz', ai_model: 'claude-opus-4-8' } });
    const res = await app.inject({ url: '/api/settings' });
    const body = res.json();
    expect(body.ai_model).toBe('claude-opus-4-8');
    expect(body.anthropic_api_key_set).toBe(true);
    expect(body.anthropic_api_key).toBeUndefined();
  });
});
