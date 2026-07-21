import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { createDb, type Db } from '../src/db.js';
import { mediaRoutes } from '../src/modules/media/routes.js';

let db: Db;
let dir: string;

function makeApp() {
  const app = Fastify();
  app.register(mediaRoutes, { db, mediaDir: dir });
  return app;
}

beforeEach(() => {
  db = createDb(':memory:');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
});

describe('GET /api/media', () => {
  it('lists media with progress and subtitle flag', async () => {
    const id = db.prepare(`INSERT INTO media (series, episode, file_path, playable_path, codec_status) VALUES ('A',1,'/a.mkv','/a.play.mp4','remuxed')`).run().lastInsertRowid;
    db.prepare(`INSERT INTO subtitle_file (media_id, file_path, format) VALUES (?, '/a.ass', 'ass')`).run(id);
    db.prepare(`INSERT INTO progress (media_id, position_sec) VALUES (?, 42)`).run(id);
    const res = await makeApp().inject({ url: '/api/media' });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(items[0]).toMatchObject({ series: 'A', episode: 1, codecStatus: 'remuxed', hasSubtitle: true, positionSec: 42 });
  });
});

describe('GET /api/media/:id/stream', () => {
  it('serves full file and honors Range', async () => {
    const file = path.join(dir, 'v.mp4');
    fs.writeFileSync(file, Buffer.from('0123456789'));
    const id = db.prepare(`INSERT INTO media (series, file_path, playable_path, codec_status) VALUES ('A', ?, ?, 'direct')`).run(file, file).lastInsertRowid;

    const full = await makeApp().inject({ url: `/api/media/${id}/stream` });
    expect(full.statusCode).toBe(200);
    expect(full.rawPayload.toString()).toBe('0123456789');

    const part = await makeApp().inject({ url: `/api/media/${id}/stream`, headers: { range: 'bytes=2-5' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 2-5/10');
    expect(part.rawPayload.toString()).toBe('2345');
  });

  it('404 when playable_path missing', async () => {
    const id = db.prepare(`INSERT INTO media (series, file_path, codec_status) VALUES ('A','/x.mkv','transcode_needed')`).run().lastInsertRowid;
    const res = await makeApp().inject({ url: `/api/media/${id}/stream` });
    expect(res.statusCode).toBe(404);
  });
});
