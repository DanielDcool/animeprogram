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
    await app.inject({ method: 'PUT', url: '/api/settings', payload: {
      ai_provider: 'deepseek', deepseek_api_key: 'sk-ds-xyz', ai_model: 'deepseek-v4-flash',
    } });
    const res = await app.inject({ url: '/api/settings' });
    const body = res.json();
    expect(body.ai_provider).toBe('deepseek');
    expect(body.ai_model).toBe('deepseek-v4-flash');
    expect(body.deepseek_api_key_set).toBe(true);
    expect(body.deepseek_api_key).toBeUndefined();
    expect(body.anthropic_api_key_set).toBe(false);
    expect(body.anthropic_api_key).toBeUndefined();
  });

  it('stores OpenAI as a provider without returning its api key', async () => {
    const { app } = makeApp();
    await app.inject({ method: 'PUT', url: '/api/settings', payload: {
      ai_provider: 'openai', openai_api_key: 'sk-openai-xyz', ai_model: 'gpt-5.6-sol',
    } });

    const res = await app.inject({ url: '/api/settings' });
    const body = res.json();

    expect(body.ai_provider).toBe('openai');
    expect(body.ai_model).toBe('gpt-5.6-sol');
    expect(body.openai_api_key_set).toBe(true);
    expect(body.openai_api_key).toBeUndefined();
  });

  it('stores Gemini as a provider without returning its api key', async () => {
    const { app } = makeApp();
    await app.inject({ method: 'PUT', url: '/api/settings', payload: {
      ai_provider: 'gemini', gemini_api_key: 'gemini-test-key', ai_model: 'gemini-3.6-flash',
    } });

    const res = await app.inject({ url: '/api/settings' });
    const body = res.json();

    expect(body.ai_provider).toBe('gemini');
    expect(body.ai_model).toBe('gemini-3.6-flash');
    expect(body.gemini_api_key_set).toBe(true);
    expect(body.gemini_api_key).toBeUndefined();
  });
});
