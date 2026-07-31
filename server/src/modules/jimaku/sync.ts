import { getSetting, type Db } from '../../db.js';
import { createJimakuClient, type JimakuClient } from './client.js';
import { downloadJimakuSubtitle, JimakuServiceError } from './service.js';

export type SubtitleSyncStatus = 'needs_mapping' | 'downloading' | 'failed';

export function setSubtitleSyncState(
  db: Db,
  mediaId: number,
  status: SubtitleSyncStatus,
  error: string | null = null,
): void {
  db.prepare(`
    INSERT INTO subtitle_sync_state (media_id, status, error) VALUES (?, ?, ?)
    ON CONFLICT(media_id) DO UPDATE SET
      status=excluded.status,
      error=excluded.error,
      updated_at=datetime('now')
  `).run(mediaId, status, error);
}

export function clearSubtitleSyncState(db: Db, mediaId: number): void {
  db.prepare('DELETE FROM subtitle_sync_state WHERE media_id=?').run(mediaId);
}

export function sanitizeSyncError(error: unknown): string {
  if (error instanceof JimakuServiceError) {
    switch (error.code) {
      case 'JIMAKU_NOT_CONFIGURED': return 'jimaku API キー未設定（設定ページで入力してください）';
      case 'NO_ENTRY': return 'jimaku の作品選択が必要です';
      case 'NO_FILE': return 'この話の字幕ファイルが見つかりませんでした';
      case 'MEDIA_NOT_FOUND': return 'メディアが見つかりませんでした';
      case 'JIMAKU_ERROR': return 'jimaku から字幕を取得できませんでした';
    }
  }
  return '字幕の自動取得に失敗しました';
}

interface SyncCandidate {
  id: number;
  entry_id: number | null;
}

export function createSubtitleSyncCoordinator(opts: {
  db: Db;
  clientFactory?: (apiKey: string) => JimakuClient;
  minIntervalMs?: number;
  delay?: (ms: number) => Promise<void>;
  log?: { error(error: unknown): void };
}) {
  const {
    db,
    clientFactory = createJimakuClient,
    minIntervalMs = 2_500,
    delay = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    log,
  } = opts;
  const queue: number[] = [];
  const queuedIds = new Set<number>();
  let worker: Promise<void> | null = null;
  let stopped = false;

  function candidates(mediaIds?: number[]): SyncCandidate[] {
    if (mediaIds && mediaIds.length === 0) return [];
    const whereIds = mediaIds
      ? `AND m.id IN (${mediaIds.map(() => '?').join(',')})`
      : '';
    return db.prepare(`
      SELECT m.id, jm.entry_id
      FROM media m
      LEFT JOIN jimaku_mapping jm ON jm.series = m.series
      WHERE NOT EXISTS (SELECT 1 FROM subtitle_file s WHERE s.media_id = m.id)
      ${whereIds}
      ORDER BY m.id
    `).all(...(mediaIds ?? [])) as SyncCandidate[];
  }

  async function runQueue(): Promise<void> {
    while (!stopped && queue.length > 0) {
      const mediaId = queue.shift()!;
      setSubtitleSyncState(db, mediaId, 'downloading');
      try {
        await downloadJimakuSubtitle({ db, mediaId, clientFactory });
        clearSubtitleSyncState(db, mediaId);
      } catch (error) {
        setSubtitleSyncState(db, mediaId, 'failed', sanitizeSyncError(error));
        const code = error instanceof JimakuServiceError ? error.code : 'UNKNOWN';
        log?.error(`jimaku subtitle sync failed: ${code}`);
      } finally {
        queuedIds.delete(mediaId);
      }

      if (!stopped && queue.length > 0 && minIntervalMs > 0) {
        await delay(minIntervalMs);
      }
    }
  }

  function ensureWorker(): void {
    if (worker || stopped || queue.length === 0) return;
    worker = runQueue().finally(() => {
      worker = null;
      ensureWorker();
    });
  }

  function enqueue(mediaId: number): void {
    if (stopped || queuedIds.has(mediaId)) return;
    queuedIds.add(mediaId);
    queue.push(mediaId);
    ensureWorker();
  }

  async function reconcile(mediaIds?: number[]): Promise<void> {
    if (stopped) return;
    if (mediaIds && mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(',');
      db.prepare(`
        DELETE FROM subtitle_sync_state
        WHERE media_id IN (${placeholders})
          AND EXISTS (SELECT 1 FROM subtitle_file s WHERE s.media_id = subtitle_sync_state.media_id)
      `).run(...mediaIds);
    } else if (!mediaIds) {
      db.prepare(`
        DELETE FROM subtitle_sync_state
        WHERE EXISTS (SELECT 1 FROM subtitle_file s WHERE s.media_id = subtitle_sync_state.media_id)
      `).run();
    }

    const apiKey = getSetting(db, 'jimaku_api_key');
    for (const candidate of candidates(mediaIds)) {
      if (candidate.entry_id == null) {
        setSubtitleSyncState(db, candidate.id, 'needs_mapping');
      } else if (!apiKey) {
        setSubtitleSyncState(
          db,
          candidate.id,
          'failed',
          'jimaku API キー未設定（設定ページで入力してください）',
        );
      } else {
        enqueue(candidate.id);
      }
    }
  }

  async function whenIdle(): Promise<void> {
    while (worker) await worker;
  }

  function stop(): void {
    stopped = true;
    queue.length = 0;
    queuedIds.clear();
  }

  return {
    reconcile,
    retry: async (mediaId: number) => reconcile([mediaId]),
    whenIdle,
    stop,
  };
}
