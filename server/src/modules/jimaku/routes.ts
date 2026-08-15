import type { FastifyInstance } from 'fastify';
import { getSetting, type Db } from '../../db.js';
import { createJimakuClient, type JimakuClient, type JimakuEntry } from './client.js';
import { downloadJimakuSubtitle, JimakuServiceError } from './service.js';
import { clearSubtitleSyncState, sanitizeSyncError, setSubtitleSyncState } from './sync.js';

interface Opts {
  db: Db;
  clientFactory?: (apiKey: string) => JimakuClient;
  // 作品を選んで字幕が取れた直後に呼ばれる。同シリーズの残り話数を自動取得させるため。
  onSubtitlesResolved?: () => void;
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
      const client = clientFactory(apiKey);
      const shortTitle = media.series.split(/\s+-\s+/, 1)[0].trim();
      const queries = shortTitle && shortTitle !== media.series
        ? [media.series, shortTitle]
        : [media.series];
      let candidates: JimakuEntry[] = [];
      for (const query of queries) {
        candidates = await client.search(query);
        if (candidates.length > 0) break;
      }
      return {
        mappingEntryId: mapping?.entry_id ?? null,
        candidates: candidates.slice(0, 8).map((c) => ({
          id: c.id, name: c.name, englishName: c.english_name ?? null, japaneseName: c.japanese_name ?? null,
        })),
      };
    } catch (err: any) {
      req.log.error('jimaku candidate search failed');
      return reply.code(502).send({ code: 'JIMAKU_ERROR', error: 'jimaku request failed' });
    }
  });

  app.post<{ Params: { id: string }; Body: { entryId?: number } }>(
    '/api/media/:id/jimaku/download',
    async (req, reply) => {
      try {
        const result = await downloadJimakuSubtitle({
          db,
          mediaId: Number(req.params.id),
          entryId: req.body?.entryId,
          clientFactory,
        });
        clearSubtitleSyncState(db, Number(req.params.id));
        // シリーズのマッピングが決まったので、同シリーズの残り話数を自動取得
        opts.onSubtitlesResolved?.();
        return { ok: true, file: result.file };
      } catch (error) {
        const err = error instanceof JimakuServiceError
          ? error
          : new JimakuServiceError('JIMAKU_ERROR', 502, 'jimaku request failed');
        const hasMapping = db.prepare(`
          SELECT 1
          FROM media m JOIN jimaku_mapping jm ON jm.series = m.series
          WHERE m.id=?
        `).get(req.params.id);
        if (hasMapping && err.code !== 'NO_ENTRY' && err.code !== 'MEDIA_NOT_FOUND') {
          setSubtitleSyncState(db, Number(req.params.id), 'failed', sanitizeSyncError(err));
        }
        req.log.error(`jimaku subtitle download failed: ${err.code}`);
        return reply.code(err.httpStatus).send({ code: err.code, error: err.message });
      }
    },
  );
}
