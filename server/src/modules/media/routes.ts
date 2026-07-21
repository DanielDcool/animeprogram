import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { scanLibrary, realOps, type FfmpegOps } from './scanner.js';

interface Opts {
  db: Db;
  mediaDir: string;
  ops?: FfmpegOps;
}

export async function mediaRoutes(app: FastifyInstance, opts: Opts) {
  const { db, mediaDir, ops = realOps } = opts;

  app.get('/api/media', async () => {
    const rows = db.prepare(`
      SELECT m.id, m.series, m.episode, m.file_path, m.codec_status, m.playable_path,
             COALESCE(p.position_sec, 0) AS position_sec,
             EXISTS(SELECT 1 FROM subtitle_file s WHERE s.media_id = m.id) AS has_subtitle
      FROM media m LEFT JOIN progress p ON p.media_id = m.id
      ORDER BY m.series, m.episode
    `).all() as any[];
    return rows.map((r) => ({
      id: r.id, series: r.series, episode: r.episode,
      codecStatus: r.codec_status, playable: r.playable_path != null,
      hasSubtitle: !!r.has_subtitle, positionSec: r.position_sec,
    }));
  });

  app.post('/api/media/scan', async () => {
    await scanLibrary(db, mediaDir, ops);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/media/:id/stream', async (req, reply) => {
    const row = db.prepare('SELECT playable_path FROM media WHERE id=?').get(req.params.id) as { playable_path: string | null } | undefined;
    if (!row?.playable_path || !fs.existsSync(row.playable_path)) {
      return reply.code(404).send({ error: 'not playable' });
    }
    const file = row.playable_path;
    const size = fs.statSync(file).size;
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      const start = m && m[1] ? Number(m[1]) : 0;
      const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      reply.code(206)
        .header('content-range', `bytes ${start}-${end}/${size}`)
        .header('accept-ranges', 'bytes')
        .header('content-length', end - start + 1)
        .header('content-type', 'video/mp4');
      return reply.send(fs.createReadStream(file, { start, end }));
    }
    reply.header('content-length', size).header('accept-ranges', 'bytes').header('content-type', 'video/mp4');
    return reply.send(fs.createReadStream(file));
  });
}
