import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting, type Db } from '../../db.js';

interface Opts {
  db: Db;
  mediaDir: string;
  defaultMediaDir: string;
  mediaDirOverridden: boolean;
}

export async function miscRoutes(app: FastifyInstance, opts: Opts) {
  const { db, mediaDir, defaultMediaDir, mediaDirOverridden } = opts;

  function getAiProvider() {
    const provider = getSetting(db, 'ai_provider');
    return provider === 'deepseek' || provider === 'openai' || provider === 'gemini' ? provider : 'anthropic';
  }

  app.put<{ Params: { id: string }; Body: { positionSec: number } }>(
    '/api/media/:id/progress',
    async (req) => {
      db.prepare(`
        INSERT INTO progress (media_id, position_sec, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(media_id) DO UPDATE SET position_sec=excluded.position_sec, updated_at=excluded.updated_at
      `).run(req.params.id, req.body.positionSec);
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>('/api/media/:id/progress', async (req) => {
    const row = db.prepare('SELECT position_sec FROM progress WHERE media_id=?').get(req.params.id) as { position_sec: number } | undefined;
    return { positionSec: row?.position_sec ?? 0 };
  });

  app.get('/api/settings', async () => ({
    ai_provider: getAiProvider(),
    ai_model: getSetting(db, 'ai_model') ?? 'claude-opus-4-8',
    anthropic_api_key_set: getSetting(db, 'anthropic_api_key') != null,
    deepseek_api_key_set: getSetting(db, 'deepseek_api_key') != null,
    openai_api_key_set: getSetting(db, 'openai_api_key') != null,
    gemini_api_key_set: getSetting(db, 'gemini_api_key') != null,
    jimaku_api_key_set: getSetting(db, 'jimaku_api_key') != null,
    tmdb_api_key_set: getSetting(db, 'tmdb_api_key') != null,
    media_dir: mediaDir,
    default_media_dir: defaultMediaDir,
    media_dir_overridden: mediaDirOverridden,
  }));

  app.put<{ Body: Record<string, string> }>('/api/settings', async (req, reply) => {
    const requestedMediaDir = req.body?.media_dir;
    if (typeof requestedMediaDir === 'string') {
      if (mediaDirOverridden) {
        return reply.code(409).send({
          code: 'MEDIA_DIR_OVERRIDDEN',
          error: 'MEDIA_DIR 環境変数が優先されています',
        });
      }
      const value = requestedMediaDir.trim();
      if (!value || !path.isAbsolute(value)) {
        return reply.code(400).send({
          code: 'INVALID_MEDIA_DIR',
          error: 'メディアフォルダには絶対パスを入力してください',
        });
      }
      setSetting(db, 'media_dir', value);
    }

    const provider = req.body?.ai_provider;
    if (provider === 'anthropic' || provider === 'deepseek' || provider === 'openai' || provider === 'gemini') {
      setSetting(db, 'ai_provider', provider);
    }
    for (const key of ['anthropic_api_key', 'deepseek_api_key', 'openai_api_key', 'gemini_api_key', 'ai_model', 'jimaku_api_key', 'tmdb_api_key'] as const) {
      const v = req.body?.[key];
      if (typeof v === 'string' && v !== '') setSetting(db, key, v);
    }
    return { ok: true };
  });
}
