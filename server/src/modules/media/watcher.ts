import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../../db.js';
import { listSourceVideos, scanFiles, type ScanResult } from './scanner.js';

interface FileSample {
  size: number;
  mtimeMs: number;
  stableSince: number;
}

export function createMediaDirectoryWatcher(opts: {
  db: Db;
  mediaDir: string;
  stableMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  scan?: (filePaths: string[]) => Promise<ScanResult>;
  onImported?: (mediaIds: number[]) => Promise<void> | void;
  watchFactory?: typeof fs.watch;
  log?: { error(error: unknown): void };
}) {
  const {
    db,
    mediaDir,
    stableMs = 15_000,
    pollIntervalMs = 30_000,
    now = Date.now,
    scan = (filePaths) => scanFiles(db, mediaDir, filePaths),
    onImported,
    watchFactory = fs.watch,
    log,
  } = opts;
  const samples = new Map<string, FileSample>();
  let directoryWatcher: fs.FSWatcher | null = null;
  let interval: NodeJS.Timeout | null = null;
  let debounce: NodeJS.Timeout | null = null;
  let reconciling = false;
  let reconcileAgain = false;
  let stopped = false;

  function sourceFiles(): string[] {
    return listSourceVideos(mediaDir);
  }

  async function reconcileOnce(): Promise<void> {
    const existing = new Set(
      (db.prepare('SELECT file_path FROM media').all() as { file_path: string }[]).map((row) => path.resolve(row.file_path)),
    );
    const seen = new Set<string>();
    const ready: string[] = [];
    const time = now();

    for (const candidate of sourceFiles()) {
      const file = path.resolve(candidate);
      seen.add(file);
      if (existing.has(file)) {
        samples.delete(file);
        continue;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        samples.delete(file);
        continue;
      }
      if (!stat.isFile() || stat.size <= 0) {
        samples.delete(file);
        continue;
      }

      const previous = samples.get(file);
      if (!previous || previous.size !== stat.size || previous.mtimeMs !== stat.mtimeMs) {
        samples.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, stableSince: time });
      } else if (time - previous.stableSince >= stableMs) {
        ready.push(file);
      }
    }

    for (const file of samples.keys()) {
      if (!seen.has(file)) samples.delete(file);
    }

    if (ready.length === 0) return;
    try {
      const result = await scan(ready);
      if (result.importedIds.length > 0) await onImported?.(result.importedIds);
      const failed = new Set(result.failedFiles.map((file) => path.resolve(file)));
      for (const file of ready) {
        if (failed.has(file)) {
          const sample = samples.get(file);
          if (sample) sample.stableSince = time;
        } else {
          samples.delete(file);
        }
      }
    } catch {
      for (const file of ready) {
        const sample = samples.get(file);
        if (sample) sample.stableSince = time;
      }
      log?.error('media directory scan failed');
    }
  }

  async function reconcileNow(): Promise<void> {
    if (stopped) return;
    if (reconciling) {
      reconcileAgain = true;
      return;
    }
    reconciling = true;
    try {
      do {
        reconcileAgain = false;
        try {
          await reconcileOnce();
        } catch {
          log?.error('media directory reconciliation failed');
        }
      } while (reconcileAgain && !stopped);
    } finally {
      reconciling = false;
    }
  }

  function scheduleReconcile(): void {
    if (stopped) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void reconcileNow();
    }, 250);
  }

  async function start(): Promise<void> {
    if (stopped || directoryWatcher) return;
    fs.mkdirSync(mediaDir, { recursive: true });
    await reconcileNow();
    directoryWatcher = watchFactory(mediaDir, scheduleReconcile);
    interval = setInterval(() => { void reconcileNow(); }, pollIntervalMs);
  }

  function stop(): void {
    stopped = true;
    directoryWatcher?.close();
    directoryWatcher = null;
    if (interval) clearInterval(interval);
    interval = null;
    if (debounce) clearTimeout(debounce);
    debounce = null;
  }

  return { start, reconcileNow, stop };
}
