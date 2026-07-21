import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { createDb, type Db } from '../src/db.js';
import { subtitleRoutes } from '../src/modules/subtitle/routes.js';

let db: Db;
function makeApp() {
  const app = Fastify();
  app.register(subtitleRoutes, { db });
  return app;
}

beforeEach(() => { db = createDb(':memory:'); });

function seed(offsetMs = 0): number {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-'));
  const srt = path.join(dir, 'a.srt');
  fs.writeFileSync(srt, '1\n00:00:10,000 --> 00:00:12,000\nこんにちは\n');
  const id = db.prepare(`INSERT INTO media (series, file_path) VALUES ('A','/a.mkv')`).run().lastInsertRowid as number;
  db.prepare(`INSERT INTO subtitle_file (media_id, file_path, format, offset_ms) VALUES (?,?,?,?)`).run(id, srt, 'srt', offsetMs);
  return id;
}

describe('GET /api/media/:id/subtitles', () => {
  it('returns cues with offset applied', async () => {
    const id = seed(500);
    const res = await makeApp().inject({ url: `/api/media/${id}/subtitles` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offsetMs).toBe(500);
    expect(body.cues[0].start).toBeCloseTo(10.5);
    expect(body.cues[0].text).toBe('こんにちは');
  });

  it('404 when no subtitle', async () => {
    const id = db.prepare(`INSERT INTO media (series, file_path) VALUES ('A','/a.mkv')`).run().lastInsertRowid;
    const res = await makeApp().inject({ url: `/api/media/${id}/subtitles` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/media/:id/subtitle-offset', () => {
  it('persists offset', async () => {
    const id = seed(0);
    const app = makeApp();
    const put = await app.inject({ method: 'PUT', url: `/api/media/${id}/subtitle-offset`, payload: { offsetMs: -300 } });
    expect(put.statusCode).toBe(200);
    const res = await app.inject({ url: `/api/media/${id}/subtitles` });
    expect(res.json().offsetMs).toBe(-300);
    expect(res.json().cues[0].start).toBeCloseTo(9.7);
  });
});
