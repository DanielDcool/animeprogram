import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createDb } from '../src/db.js';
import type { ScanResult } from '../src/modules/media/scanner.js';
import { createMediaDirectoryWatcher } from '../src/modules/media/watcher.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'media-watcher-'));
}

function successfulScan(db: ReturnType<typeof createDb>) {
  return vi.fn(async (paths: string[]): Promise<ScanResult> => {
    const importedIds = paths.map((filePath) => Number(db.prepare(
      `INSERT INTO media (series, file_path, playable_path, codec_status) VALUES ('Show', ?, ?, 'direct')`,
    ).run(filePath, filePath).lastInsertRowid));
    return { importedIds, failedFiles: [] };
  });
}

describe('createMediaDirectoryWatcher', () => {
  it('imports a source video only after size and mtime stay stable for 15 seconds', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'Show - 01.mp4');
    fs.writeFileSync(file, 'video');
    const db = createDb(':memory:');
    const scan = successfulScan(db);
    const imported: number[] = [];
    let now = 0;
    const watcher = createMediaDirectoryWatcher({
      db,
      mediaDir: dir,
      stableMs: 15_000,
      now: () => now,
      scan,
      onImported: (ids) => { imported.push(...ids); },
    });

    await watcher.reconcileNow();
    now = 14_999;
    await watcher.reconcileNow();
    expect(scan).not.toHaveBeenCalled();

    now = 15_000;
    await watcher.reconcileNow();
    expect(scan).toHaveBeenCalledWith([file]);
    expect(imported).toHaveLength(1);
  });

  it('resets the stability window when the file changes', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'Show - 02.mkv');
    fs.writeFileSync(file, 'a');
    const db = createDb(':memory:');
    const scan = successfulScan(db);
    let now = 0;
    const watcher = createMediaDirectoryWatcher({ db, mediaDir: dir, stableMs: 15_000, now: () => now, scan });

    await watcher.reconcileNow();
    now = 10_000;
    fs.appendFileSync(file, 'b');
    await watcher.reconcileNow();
    now = 24_999;
    await watcher.reconcileNow();
    expect(scan).not.toHaveBeenCalled();

    now = 25_000;
    await watcher.reconcileNow();
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('ignores hidden files and generated play files', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.partial.mp4'), 'x');
    fs.writeFileSync(path.join(dir, 'Show - 03.play.mp4'), 'x');
    const db = createDb(':memory:');
    const scan = successfulScan(db);
    let now = 0;
    const watcher = createMediaDirectoryWatcher({ db, mediaDir: dir, stableMs: 15_000, now: () => now, scan });

    await watcher.reconcileNow();
    now = 15_000;
    await watcher.reconcileNow();

    expect(scan).not.toHaveBeenCalled();
  });

  it('tracks a video inside a season subdirectory', async () => {
    const dir = tmpDir();
    const seasonDir = path.join(dir, 'Show Season 1');
    fs.mkdirSync(seasonDir);
    const file = path.join(seasonDir, 'Show - 01.mkv');
    fs.writeFileSync(file, 'video');
    const db = createDb(':memory:');
    const scan = successfulScan(db);
    let now = 0;
    const watcher = createMediaDirectoryWatcher({
      db,
      mediaDir: dir,
      stableMs: 15_000,
      now: () => now,
      scan,
    });

    await watcher.reconcileNow();
    now = 15_000;
    await watcher.reconcileNow();

    expect(scan).toHaveBeenCalledWith([file]);
  });

  it('keeps a failed file eligible for a later retry', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'Show - 04.mkv');
    fs.writeFileSync(file, 'video');
    const db = createDb(':memory:');
    let calls = 0;
    const scan = vi.fn(async (): Promise<ScanResult> => {
      calls += 1;
      if (calls === 1) return { importedIds: [], failedFiles: [file] };
      const id = Number(db.prepare(
        `INSERT INTO media (series, file_path, playable_path, codec_status) VALUES ('Show', ?, ?, 'direct')`,
      ).run(file, file).lastInsertRowid);
      return { importedIds: [id], failedFiles: [] };
    });
    let now = 0;
    const watcher = createMediaDirectoryWatcher({ db, mediaDir: dir, stableMs: 15_000, now: () => now, scan });

    await watcher.reconcileNow();
    now = 15_000;
    await watcher.reconcileNow();
    now = 30_000;
    await watcher.reconcileNow();

    expect(scan).toHaveBeenCalledTimes(2);
    expect(db.prepare('SELECT COUNT(*) c FROM media').get()).toEqual({ c: 1 });
  });

  it('falls back to periodic reconciliation when the directory watcher fails', async () => {
    const dir = tmpDir();
    const db = createDb(':memory:');
    const fsWatcher = Object.assign(new EventEmitter(), { close: vi.fn() });
    const log = { error: vi.fn() };
    const watcher = createMediaDirectoryWatcher({
      db,
      mediaDir: dir,
      watchFactory: vi.fn(() => fsWatcher as unknown as fs.FSWatcher),
      log,
    });

    await watcher.start();
    fsWatcher.emit('error', new Error('watch unavailable'));
    await watcher.reconcileNow();
    watcher.stop();

    expect(fsWatcher.close).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith('media directory watcher failed; periodic reconciliation remains active');
  });

  it('starts periodic reconciliation when the operating system cannot create a watcher', async () => {
    const dir = tmpDir();
    const db = createDb(':memory:');
    const log = { error: vi.fn() };
    const watcher = createMediaDirectoryWatcher({
      db,
      mediaDir: dir,
      watchFactory: vi.fn(() => { throw new Error('watch unavailable'); }),
      log,
    });

    await expect(watcher.start()).resolves.toBeUndefined();
    await watcher.reconcileNow();
    watcher.stop();

    expect(log.error).toHaveBeenCalledWith('media directory watcher failed; periodic reconciliation remains active');
  });
});
