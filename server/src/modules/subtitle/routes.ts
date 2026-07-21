import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { parseSubtitle } from './parser.js';

export async function subtitleRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get<{ Params: { id: string } }>('/api/media/:id/subtitles', async (req, reply) => {
    const sub = db.prepare('SELECT * FROM subtitle_file WHERE media_id=?').get(req.params.id) as any;
    if (!sub || !fs.existsSync(sub.file_path)) return reply.code(404).send({ error: 'no subtitle' });
    const cues = parseSubtitle(fs.readFileSync(sub.file_path, 'utf8'), sub.format);
    const offset = sub.offset_ms / 1000;
    return {
      offsetMs: sub.offset_ms,
      cues: cues.map((c) => ({ start: c.start + offset, end: c.end + offset, text: c.text })),
    };
  });

  app.put<{ Params: { id: string }; Body: { offsetMs: number } }>(
    '/api/media/:id/subtitle-offset',
    async (req, reply) => {
      const info = db.prepare('UPDATE subtitle_file SET offset_ms=? WHERE media_id=?')
        .run(Math.round(req.body.offsetMs), req.params.id);
      if (info.changes === 0) return reply.code(404).send({ error: 'no subtitle' });
      return { ok: true };
    },
  );
}
