import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting, type Db } from '../../db.js';

export async function miscRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

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

  app.get('/api/settings', async () => ({
    ai_model: getSetting(db, 'ai_model') ?? 'claude-opus-4-8',
    anthropic_api_key_set: getSetting(db, 'anthropic_api_key') != null,
  }));

  app.put<{ Body: Record<string, string> }>('/api/settings', async (req) => {
    for (const key of ['anthropic_api_key', 'ai_model'] as const) {
      const v = req.body?.[key];
      if (typeof v === 'string' && v !== '') setSetting(db, key, v);
    }
    return { ok: true };
  });
}
