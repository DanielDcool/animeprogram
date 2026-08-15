import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { createDb, setSetting, type Db } from '../src/db.js';
import { createJimakuClient, pickBestFile, type JimakuClient, type JimakuFile } from '../src/modules/jimaku/client.js';
import { jimakuRoutes } from '../src/modules/jimaku/routes.js';
import { downloadJimakuSubtitle } from '../src/modules/jimaku/service.js';

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

describe('downloadJimakuSubtitle', () => {
  it('downloads a subtitle without going through the HTTP route', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);

    const result = await downloadJimakuSubtitle({
      db,
      mediaId: id,
      entryId: 100,
      clientFactory: () => fakeClient(),
    });

    expect(result.file).toBe('Test Show 02.srt');
    expect(fs.existsSync(result.destination)).toBe(true);
    expect(db.prepare('SELECT format FROM subtitle_file WHERE media_id=?').get(id)).toEqual({ format: 'srt' });
  });

  it('omits the episode filter for a fractional special episode', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jimaku-special-'));
    const video = path.join(dir, 'Test Show - 17.5.mkv');
    fs.writeFileSync(video, 'x');
    const id = db.prepare(`
      INSERT INTO media (series, episode, file_path) VALUES ('Test Show', 17.5, ?)
    `).run(video).lastInsertRowid as number;
    const client = fakeClient();

    await downloadJimakuSubtitle({
      db,
      mediaId: id,
      entryId: 300,
      clientFactory: () => client,
    });

    expect(client.files).toHaveBeenCalledWith(300, null);
  });

  it('returns a stable error code when no entry was selected or mapped', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);

    await expect(downloadJimakuSubtitle({ db, mediaId: id, clientFactory: () => fakeClient() }))
      .rejects.toMatchObject({ code: 'NO_ENTRY', httpStatus: 400 });
  });
});

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

  it('retries a dash-separated series with its short title when no candidate is found', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jimaku-title-'));
    const video = path.join(dir, 'Mushoku Tensei - 01.mkv');
    fs.writeFileSync(video, 'x');
    const id = db.prepare(`
      INSERT INTO media (series, episode, file_path)
      VALUES ('Mushoku Tensei - Isekai Ittara Honki Dasu', 1, ?)
    `).run(video).lastInsertRowid as number;
    const client = fakeClient();
    vi.mocked(client.search)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 300, name: 'Mushoku Tensei' }]);

    const res = await makeApp(db, client).inject({ url: `/api/media/${id}/jimaku/candidates` });

    expect(res.statusCode).toBe(200);
    expect(client.search).toHaveBeenNthCalledWith(1, 'Mushoku Tensei - Isekai Ittara Honki Dasu');
    expect(client.search).toHaveBeenNthCalledWith(2, 'Mushoku Tensei');
    expect(res.json().candidates[0]).toMatchObject({ id: 300, name: 'Mushoku Tensei' });
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

  it('clears an automatic failure state after a manual retry succeeds', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    db.prepare(`INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES ('Test Show', 100, 'Test Show')`).run();
    db.prepare(`INSERT INTO subtitle_sync_state (media_id, status, error) VALUES (?, 'failed', 'old error')`).run(id);

    const res = await makeApp(db, fakeClient()).inject({
      method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(db.prepare('SELECT * FROM subtitle_sync_state WHERE media_id=?').get(id)).toBeUndefined();
  });

  it('stores a retryable state when a mapped manual download fails', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    db.prepare(`INSERT INTO jimaku_mapping (series, entry_id, entry_name) VALUES ('Test Show', 100, 'Test Show')`).run();
    const client = fakeClient();
    vi.mocked(client.files).mockRejectedValue(new Error('upstream response'));

    const res = await makeApp(db, client).inject({
      method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: {},
    });

    expect(res.statusCode).toBe(502);
    expect(db.prepare('SELECT status, error FROM subtitle_sync_state WHERE media_id=?').get(id)).toEqual({
      status: 'failed',
      error: 'jimaku から字幕を取得できませんでした',
    });
  });

  it('remembers a first-time selection even when its subtitle download fails', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    const client = fakeClient();
    vi.mocked(client.files).mockRejectedValue(new Error('upstream response'));

    const res = await makeApp(db, client).inject({
      method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: { entryId: 100 },
    });

    expect(res.statusCode).toBe(502);
    expect(db.prepare('SELECT entry_id FROM jimaku_mapping WHERE series=?').get('Test Show')).toEqual({ entry_id: 100 });
    expect(db.prepare('SELECT status FROM subtitle_sync_state WHERE media_id=?').get(id)).toEqual({ status: 'failed' });
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

describe('jimaku entry search across anime and drama', () => {
  it('queries both libraries and merges by entry id', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string | URL) => {
      const href = String(url);
      urls.push(href);
      const entries = href.includes('anime=true')
        ? [{ id: 1, name: 'Anime Entry' }, { id: 9, name: 'Shared Entry' }]
        : [{ id: 9, name: 'Shared Entry' }, { id: 2, name: 'Drama Entry' }];
      return new Response(JSON.stringify(entries), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const entries = await createJimakuClient('test-key', fetchFn).search('silent');

    expect(urls).toHaveLength(2);
    expect(urls.some((url) => url.includes('anime=true'))).toBe(true);
    expect(urls.some((url) => url.includes('anime=false'))).toBe(true);
    expect(entries.map((entry) => entry.id)).toEqual([1, 9, 2]);
  });

  it('still returns anime results when the drama library errors', async () => {
    const fetchFn = (async (url: string | URL) => {
      if (String(url).includes('anime=false')) return new Response('nope', { status: 500 });
      return new Response(JSON.stringify([{ id: 1, name: 'Anime Entry' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await expect(createJimakuClient('test-key', fetchFn).search('frieren'))
      .resolves.toEqual([{ id: 1, name: 'Anime Entry' }]);
  });
});

describe('onSubtitlesResolved (シリーズ自動取得のトリガー)', () => {
  it('fires after a successful pick+download so siblings can auto-sync', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    const onSubtitlesResolved = vi.fn();
    const app = Fastify();
    app.register(jimakuRoutes, { db, clientFactory: () => fakeClient(), onSubtitlesResolved });

    const res = await app.inject({
      method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: { entryId: 100 },
    });

    expect(res.statusCode).toBe(200);
    expect(onSubtitlesResolved).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the download fails (no entry / no mapping)', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'jimaku_api_key', 'key');
    const id = seedMedia(db);
    const onSubtitlesResolved = vi.fn();
    const app = Fastify();
    app.register(jimakuRoutes, { db, clientFactory: () => fakeClient(), onSubtitlesResolved });

    // entryId 無し & マッピング無し → NO_ENTRY で失敗
    const res = await app.inject({ method: 'POST', url: `/api/media/${id}/jimaku/download`, payload: {} });

    expect(res.statusCode).toBe(400);
    expect(onSubtitlesResolved).not.toHaveBeenCalled();
  });
});
