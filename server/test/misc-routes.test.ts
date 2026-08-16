import { describe, it, expect } from 'vitest';
import path from 'node:path';
import Fastify from 'fastify';
import { createDb } from '../src/db.js';
import { miscRoutes } from '../src/modules/misc/routes.js';

function makeApp(
  db = createDb(':memory:'),
  opts: { mediaDir?: string; defaultMediaDir?: string; mediaDirOverridden?: boolean } = {},
) {
  const app = Fastify();
  const defaultMediaDir = path.resolve('AnimeLibrary');
  app.register(miscRoutes, {
    db,
    mediaDir: defaultMediaDir,
    defaultMediaDir,
    mediaDirOverridden: false,
    ...opts,
  });
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

  it('returns the saved position or zero for an unwatched media item', async () => {
    const { app, db } = makeApp();
    const watchedId = db.prepare(`INSERT INTO media (series, file_path) VALUES ('A','/a')`).run().lastInsertRowid;
    const unwatchedId = db.prepare(`INSERT INTO media (series, file_path) VALUES ('B','/b')`).run().lastInsertRowid;
    await app.inject({ method: 'PUT', url: `/api/media/${watchedId}/progress`, payload: { positionSec: 301.25 } });

    const watched = await app.inject({ url: `/api/media/${watchedId}/progress` });
    const unwatched = await app.inject({ url: `/api/media/${unwatchedId}/progress` });

    expect(watched.json()).toEqual({ positionSec: 301.25 });
    expect(unwatched.json()).toEqual({ positionSec: 0 });
  });
});

describe('settings', () => {
  it('returns the active and default media directories', async () => {
    const defaultMediaDir = path.resolve('default-anime');
    const mediaDir = path.resolve('saved-anime');
    const { app } = makeApp(createDb(':memory:'), { mediaDir, defaultMediaDir });

    const res = await app.inject({ url: '/api/settings' });

    expect(res.json()).toMatchObject({
      media_dir: mediaDir,
      default_media_dir: defaultMediaDir,
      media_dir_overridden: false,
    });
  });

  it('stores an absolute media directory for the next start', async () => {
    const { app, db } = makeApp();
    const mediaDir = path.resolve('another-anime-library');

    const put = await app.inject({
      method: 'PUT', url: '/api/settings', payload: { media_dir: mediaDir },
    });

    expect(put.statusCode).toBe(200);
    expect(db.prepare('SELECT value FROM settings WHERE key=?').pluck().get('media_dir')).toBe(mediaDir);
  });

  it('rejects a relative media directory', async () => {
    const { app, db } = makeApp();

    const put = await app.inject({
      method: 'PUT', url: '/api/settings', payload: { media_dir: 'relative/folder' },
    });

    expect(put.statusCode).toBe(400);
    expect(put.json().code).toBe('INVALID_MEDIA_DIR');
    expect(db.prepare('SELECT value FROM settings WHERE key=?').pluck().get('media_dir')).toBeUndefined();
  });

  it('does not replace an active MEDIA_DIR environment override', async () => {
    const { app, db } = makeApp(createDb(':memory:'), { mediaDirOverridden: true });

    const put = await app.inject({
      method: 'PUT', url: '/api/settings', payload: { media_dir: path.resolve('ignored') },
    });

    expect(put.statusCode).toBe(409);
    expect(put.json().code).toBe('MEDIA_DIR_OVERRIDDEN');
    expect(db.prepare('SELECT value FROM settings WHERE key=?').pluck().get('media_dir')).toBeUndefined();
  });

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

  it('reports the explain language as auto plus the language detected from the browser', async () => {
    const { app } = makeApp();

    const zh = await app.inject({ url: '/api/settings', headers: { 'accept-language': 'zh-CN,zh;q=0.9' } });
    const en = await app.inject({ url: '/api/settings', headers: { 'accept-language': 'en-US,en;q=0.9' } });

    expect(zh.json()).toMatchObject({ explain_language: 'auto', explain_language_detected: 'zh' });
    expect(en.json()).toMatchObject({ explain_language: 'auto', explain_language_detected: 'en' });
  });

  it('stores an explicit explain language and lets auto clear it again', async () => {
    const { app, db } = makeApp();

    await app.inject({ method: 'PUT', url: '/api/settings', payload: { explain_language: 'en' } });
    const fixed = await app.inject({ url: '/api/settings', headers: { 'accept-language': 'zh-CN' } });
    expect(fixed.json()).toMatchObject({ explain_language: 'en', explain_language_detected: 'zh' });
    expect(db.prepare('SELECT value FROM settings WHERE key=?').pluck().get('explain_language')).toBe('en');

    await app.inject({ method: 'PUT', url: '/api/settings', payload: { explain_language: 'auto' } });
    const auto = await app.inject({ url: '/api/settings', headers: { 'accept-language': 'zh-CN' } });
    expect(auto.json()).toMatchObject({ explain_language: 'auto' });
  });

  it('ignores unsupported explain languages', async () => {
    const { app, db } = makeApp();

    await app.inject({ method: 'PUT', url: '/api/settings', payload: { explain_language: 'ja' } });

    expect(db.prepare('SELECT value FROM settings WHERE key=?').pluck().get('explain_language')).toBeUndefined();
  });
});
