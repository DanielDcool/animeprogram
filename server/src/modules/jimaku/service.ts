import fs from 'node:fs';
import path from 'node:path';
import { getSetting, type Db } from '../../db.js';
import { createJimakuClient, pickBestFile, type JimakuClient } from './client.js';

export type JimakuErrorCode =
  | 'MEDIA_NOT_FOUND'
  | 'JIMAKU_NOT_CONFIGURED'
  | 'NO_ENTRY'
  | 'NO_FILE'
  | 'JIMAKU_ERROR';

export class JimakuServiceError extends Error {
  constructor(
    public readonly code: JimakuErrorCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'JimakuServiceError';
  }
}

interface MediaRow {
  id: number;
  series: string;
  episode: number | null;
  file_path: string;
}

export async function downloadJimakuSubtitle(opts: {
  db: Db;
  mediaId: number;
  entryId?: number;
  clientFactory?: (apiKey: string) => JimakuClient;
}): Promise<{ file: string; destination: string }> {
  const { db, mediaId, entryId: requestedEntryId, clientFactory = createJimakuClient } = opts;
  const media = db.prepare('SELECT id, series, episode, file_path FROM media WHERE id=?').get(mediaId) as MediaRow | undefined;
  if (!media) throw new JimakuServiceError('MEDIA_NOT_FOUND', 404, 'media not found');

  const apiKey = getSetting(db, 'jimaku_api_key');
  if (!apiKey) {
    throw new JimakuServiceError('JIMAKU_NOT_CONFIGURED', 503, 'jimaku API key not set (settings page)');
  }

  const mapping = db.prepare('SELECT entry_id, entry_name FROM jimaku_mapping WHERE series=?').get(media.series) as
    { entry_id: number; entry_name: string } | undefined;
  const entryId = requestedEntryId ?? mapping?.entry_id;
  if (entryId == null) throw new JimakuServiceError('NO_ENTRY', 400, 'pick a jimaku entry first');
  const entryName = mapping?.entry_id === entryId ? mapping.entry_name : String(entryId);

  if (requestedEntryId != null) {
    db.prepare(`
      INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES (?,?,?)
      ON CONFLICT(series) DO UPDATE SET entry_id=excluded.entry_id, entry_name=excluded.entry_name
    `).run(media.series, entryId, entryName);
  }

  try {
    const client = clientFactory(apiKey);
    const episode = media.episode != null && Number.isInteger(media.episode)
      ? media.episode
      : null;
    const files = await client.files(entryId, episode);
    const best = pickBestFile(files);
    if (!best) {
      throw new JimakuServiceError(
        'NO_FILE',
        404,
        '単話の字幕ファイルが見つかりません（アーカイブのみの可能性。jimaku で手動確認を）',
      );
    }

    const buf = await client.download(best.url);
    const ext = /\.srt$/i.test(best.name) ? 'srt' : 'ass';
    const videoBase = path.basename(media.file_path).replace(/\.[^.]+$/, '');
    const destination = path.join(path.dirname(media.file_path), `${videoBase}.ja.${ext}`);
    fs.writeFileSync(destination, buf);

    db.prepare(`
      INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES (?,?,?)
      ON CONFLICT(series) DO UPDATE SET entry_id=excluded.entry_id, entry_name=excluded.entry_name
    `).run(media.series, entryId, entryName);
    db.prepare('DELETE FROM subtitle_file WHERE media_id=?').run(media.id);
    db.prepare('INSERT INTO subtitle_file (media_id, file_path, format) VALUES (?,?,?)').run(media.id, destination, ext);

    return { file: best.name, destination };
  } catch (error) {
    if (error instanceof JimakuServiceError) throw error;
    throw new JimakuServiceError('JIMAKU_ERROR', 502, 'jimaku request failed');
  }
}
