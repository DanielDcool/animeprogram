import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getSetting, type Db } from '../../db.js';
import { createJimakuClient, pickBestFile, type JimakuClient } from './client.js';

interface Opts {
  db: Db;
  clientFactory?: (apiKey: string) => JimakuClient;
}

interface MediaRow {
  id: number;
  series: string;
  episode: number | null;
  file_path: string;
}

export async function jimakuRoutes(app: FastifyInstance, opts: Opts) {
  const { db, clientFactory = createJimakuClient } = opts;

  function requireSetup(mediaId: string) {
    const media = db.prepare('SELECT id, series, episode, file_path FROM media WHERE id=?').get(mediaId) as MediaRow | undefined;
    const apiKey = getSetting(db, 'jimaku_api_key');
    return { media, apiKey };
  }

  app.get<{ Params: { id: string } }>('/api/media/:id/jimaku/candidates', async (req, reply) => {
    const { media, apiKey } = requireSetup(req.params.id);
    if (!media) return reply.code(404).send({ error: 'media not found' });
    if (!apiKey) return reply.code(503).send({ code: 'JIMAKU_NOT_CONFIGURED', error: 'jimaku API key not set (settings page)' });

    const mapping = db.prepare('SELECT entry_id FROM jimaku_mapping WHERE series=?').get(media.series) as { entry_id: number } | undefined;
    try {
      const candidates = await clientFactory(apiKey).search(media.series);
      return {
        mappingEntryId: mapping?.entry_id ?? null,
        candidates: candidates.slice(0, 8).map((c) => ({
          id: c.id, name: c.name, englishName: c.english_name ?? null, japaneseName: c.japanese_name ?? null,
        })),
      };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(502).send({ code: 'JIMAKU_ERROR', error: String(err?.message ?? err) });
    }
  });

  app.post<{ Params: { id: string }; Body: { entryId?: number } }>(
    '/api/media/:id/jimaku/download',
    async (req, reply) => {
      const { media, apiKey } = requireSetup(req.params.id);
      if (!media) return reply.code(404).send({ error: 'media not found' });
      if (!apiKey) return reply.code(503).send({ code: 'JIMAKU_NOT_CONFIGURED', error: 'jimaku API key not set (settings page)' });

      const mapping = db.prepare('SELECT entry_id, entry_name FROM jimaku_mapping WHERE series=?').get(media.series) as { entry_id: number; entry_name: string } | undefined;
      const entryId = req.body?.entryId ?? mapping?.entry_id;
      if (entryId == null) return reply.code(400).send({ code: 'NO_ENTRY', error: 'pick a jimaku entry first' });

      const client = clientFactory(apiKey);
      try {
        const files = await client.files(entryId, media.episode);
        const best = pickBestFile(files);
        if (!best) {
          return reply.code(404).send({ code: 'NO_FILE', error: '単話の字幕ファイルが見つかりません（アーカイブのみの可能性。jimaku で手動確認を）' });
        }

        const buf = await client.download(best.url);
        const ext = /\.srt$/i.test(best.name) ? 'srt' : 'ass';
        const videoBase = path.basename(media.file_path).replace(/\.[^.]+$/, '');
        const dest = path.join(path.dirname(media.file_path), `${videoBase}.ja.${ext}`);
        fs.writeFileSync(dest, buf);

        db.prepare(`
          INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES (?,?,?)
          ON CONFLICT(series) DO UPDATE SET entry_id=excluded.entry_id, entry_name=excluded.entry_name
        `).run(media.series, entryId, mapping?.entry_name ?? String(entryId));
        db.prepare('DELETE FROM subtitle_file WHERE media_id=?').run(media.id);
        db.prepare('INSERT INTO subtitle_file (media_id, file_path, format) VALUES (?,?,?)').run(media.id, dest, ext);

        return { ok: true, file: best.name };
      } catch (err: any) {
        req.log.error(err);
        if (reply.sent) return;
        return reply.code(502).send({ code: 'JIMAKU_ERROR', error: String(err?.message ?? err) });
      }
    },
  );
}
