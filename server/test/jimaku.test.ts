import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { createDb, setSetting, type Db } from '../src/db.js';
import { pickBestFile, type JimakuClient, type JimakuFile } from '../src/modules/jimaku/client.js';
import { jimakuRoutes } from '../src/modules/jimaku/routes.js';

describe('pickBestFile', () => {
  const f = (name: string): JimakuFile => ({ url: `https://files/${name}`, name, size: 100 });

  it('prefers srt over ass and skips archives', () => {
    expect(pickBestFile([f('a.zip'), f('ep1.ass'), f('ep1.srt')])!.name).toBe('ep1.srt');
    expect(pickBestFile([f('a.7z'), f('ep1.ass')])!.name).toBe('ep1.ass');
  });

  it('returns null when only archives', () => {
    expect(pickBestFile([f('all.zip')])).toBeNull();
    expect(pickBestFile([])).toBeNull();
  });
});

function seedMedia(db: Db): number {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jimaku-'));
  const video = path.join(dir, 'Test Show - 02.mkv');
  fs.writeFileSync(video, 'x');
  return db.prepare(`INSERT INTO media (series, episode, file_path) VALUES ('Test Show', 2, ?)`)
    .run(video).lastInsertRowid as number;
}

function fakeClient(): JimakuClient {
  return {
    search: vi.fn().mockResolvedValue([
      { id: 100, name: 'Test Show', japanese_name: 'テストショー' },
      { id: 200, name: 'Test Show Movie' },
    ]),
    files: vi.fn().mockResolvedValue([
      { url: 'https://files/ep2.srt', name: 'Test Show 02.srt', size: 5 },
      { url: 'https://files/ep2.ass', name: 'Test Show 02.ass', size: 5 },
    ]),
    download: vi.fn().mockResolvedValue(Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nテスト\n')),
  };
}

function makeApp(db: Db, client: JimakuClient) {
  const app = Fastify();
  app.register(jimakuRoutes, { db, clientFactory: () => client });
  return app;
}

describe('GET /api/media/:id/jimaku/candidates', () => {
  it('503 when api key not set', async () => {
    const db = createDb(':memory:');
    const id = seedMedia(db);
    const res = await makeApp(db, fakeClient()).inject({ url: `/api/media/${id}/jimaku/candidates` });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('JIMAKU_NOT_CONFIGURED');
  });

  it('returns candidates and stored mapping', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    db.prepare(`INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES ('Test Show', 100, 'Test Show')`).run();
    const id = seedMedia(db);
    const res = await makeApp(db, fakeClient()).inject({ url: `/api/media/${id}/jimaku/candidates` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mappingEntryId).toBe(100);
    expect(body.candidates[0]).toMatchObject({ id: 100, name: 'Test Show' });
  });
});

describe('POST /api/media/:id/jimaku/download', () => {
  it('downloads best file, saves mapping and subtitle row', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    const client = fakeClient();
    const res = await makeApp(db, client).inject({
      method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: { entryId: 100 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().file).toBe('Test Show 02.srt');

    // episode 付きで files を呼んでいる
    expect((client.files as any).mock.calls[0]).toEqual([100, 2]);

    // 字幕ファイルが動画と同じディレクトリに保存され、DB に登録される
    const sub: any = db.prepare('SELECT * FROM subtitle_file WHERE media_id=?').get(id);
    expect(sub.format).toBe('srt');
    expect(sub.file_path.endsWith('Test Show - 02.ja.srt')).toBe(true);
    expect(fs.readFileSync(sub.file_path, 'utf8')).toContain('テスト');

    // マッピングが保存される
    const map: any = db.prepare(`SELECT * FROM jimaku_mapping WHERE series='Test Show'`).get();
    expect(map.entry_id).toBe(100);
  });

  it('uses stored mapping when entryId omitted, replaces old subtitle row', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    db.prepare(`INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES ('Test Show', 100, 'Test Show')`).run();
    db.prepare(`INSERT INTO subtitle_file (media_id, file_path, format) VALUES (?, '/old.ass', 'ass')`).run(id);

    const res = await makeApp(db, fakeClient()).inject({
      method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: {},
    });
    expect(res.statusCode).toBe(200);
    const subs = db.prepare('SELECT * FROM subtitle_file WHERE media_id=?').all(id) as any[];
    expect(subs).toHaveLength(1);
    expect(subs[0].format).toBe('srt');
  });

  it('400 when no entryId and no mapping', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    const res = await makeApp(db, fakeClient()).inject({
      method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('NO_ENTRY');
  });

  it('404 with NO_FILE when entry only has archives', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    const client = fakeClient();
    (client.files as any).mockResolvedValue([{ url: 'u', name: 'season1.zip', size: 1 }]);
    const res = await makeApp(db, client).inject({
      method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: { entryId: 100 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NO_FILE');
  });
});
