import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, setSetting, type Db } from '../src/db.js';
import type { JimakuClient } from '../src/modules/jimaku/client.js';
import { createSubtitleSyncCoordinator } from '../src/modules/jimaku/sync.js';

function seedMedia(db: Db, series: string): number {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jimaku-sync-'));
  const video = path.join(dir, `${series} - 01.mkv`);
  fs.writeFileSync(video, 'x');
  return Number(db.prepare('INSERT INTO media (series, episode, file_path) VALUES (?, 1, ?)').run(series, video).lastInsertRowid);
}

function fakeClient(): JimakuClient {
  return {
    search: vi.fn().mockResolvedValue([]),
    files: vi.fn().mockResolvedValue([{ url: 'https://files/ep1.srt', name: 'Episode 01.srt', size: 5 }]),
    download: vi.fn().mockResolvedValue(Buffer.from('subtitle')),
  };
}

function state(db: Db, mediaId: number) {
  return db.prepare('SELECT status, error FROM subtitle_sync_state WHERE media_id=?').get(mediaId) as
    { status: string; error: string | null } | undefined;
}

describe('createSubtitleSyncCoordinator', () => {
  it('marks subtitle-less media without a mapping for one-time selection', async () => {
    const db = createDb(':memory:');
    const mediaId = seedMedia(db, 'Needs Mapping');
    const coordinator = createSubtitleSyncCoordinator({ db, minIntervalMs: 0 });

    await coordinator.reconcile([mediaId]);

    expect(state(db, mediaId)).toEqual({ status: 'needs_mapping', error: null });
  });

  it('downloads mapped subtitles and clears the pending state', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const mediaId = seedMedia(db, 'Mapped Show');
    db.prepare('INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES (?, 100, ?)')
      .run('Mapped Show', 'Mapped Show');
    const client = fakeClient();
    const coordinator = createSubtitleSyncCoordinator({
      db,
      clientFactory: () => client,
      minIntervalMs: 0,
    });

    await coordinator.reconcile([mediaId, mediaId]);
    await coordinator.whenIdle();

    expect(client.files).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT format FROM subtitle_file WHERE media_id=?').get(mediaId)).toEqual({ format: 'srt' });
    expect(state(db, mediaId)).toBeUndefined();
  });

  it('keeps the mapping and stores a retryable failure', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const mediaId = seedMedia(db, 'Failing Show');
    db.prepare('INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES (?, 100, ?)')
      .run('Failing Show', 'Failing Show');
    const client = fakeClient();
    vi.mocked(client.files).mockRejectedValue(new Error('upstream secret response'));
    const coordinator = createSubtitleSyncCoordinator({
      db,
      clientFactory: () => client,
      minIntervalMs: 0,
    });

    await coordinator.reconcile([mediaId]);
    await coordinator.whenIdle();

    expect(state(db, mediaId)).toEqual({ status: 'failed', error: 'jimaku から字幕を取得できませんでした' });
    expect(db.prepare('SELECT entry_id FROM jimaku_mapping WHERE series=?').get('Failing Show')).toEqual({ entry_id: 100 });
    expect(state(db, mediaId)?.error).not.toContain('secret');
  });

  it('skips media that already has a subtitle', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const mediaId = seedMedia(db, 'Ready Show');
    db.prepare('INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES (?, 100, ?)')
      .run('Ready Show', 'Ready Show');
    db.prepare('INSERT INTO subtitle_file (media_id, file_path, format) VALUES (?, ?, ?)')
      .run(mediaId, '/ready.srt', 'srt');
    const client = fakeClient();
    const coordinator = createSubtitleSyncCoordinator({ db, clientFactory: () => client, minIntervalMs: 0 });

    await coordinator.reconcile([mediaId]);
    await coordinator.whenIdle();

    expect(client.files).not.toHaveBeenCalled();
    expect(state(db, mediaId)).toBeUndefined();
  });
});
