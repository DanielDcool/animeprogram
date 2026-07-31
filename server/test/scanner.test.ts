import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../src/db.js';
import { scanLibrary, type FfmpegOps } from '../src/modules/media/scanner.js';

function tmpLib(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
  for (const f of files) fs.writeFileSync(path.join(dir, f), 'x');
  return dir;
}

const fakeOps: FfmpegOps = {
  probe: async () => ({
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
      { index: 1, codec_type: 'audio', codec_name: 'aac' },
      { index: 2, codec_type: 'subtitle', codec_name: 'ass', tags: { language: 'jpn' } },
    ],
  }),
  remux: async (_i, out) => { fs.writeFileSync(out, 'mp4'); },
  extractSub: async (_i, _s, out) => { fs.writeFileSync(out, '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'); },
};

describe('scanLibrary', () => {
  it('imports mkv: remuxes, extracts subs, records rows', async () => {
    const dir = tmpLib(['[SubsPlease] Test Show - 01 (1080p).mkv']);
    const db = createDb(':memory:');
    await scanLibrary(db, dir, fakeOps);

    const media: any = db.prepare('SELECT * FROM media').get();
    expect(media.series).toBe('Test Show');
    expect(media.episode).toBe(1);
    expect(media.codec_status).toBe('remuxed');
    expect(fs.existsSync(media.playable_path)).toBe(true);

    const sub: any = db.prepare('SELECT * FROM subtitle_file WHERE media_id=?').get(media.id);
    expect(sub.format).toBe('ass');
  });

  it('is idempotent (second scan adds nothing)', async () => {
    const dir = tmpLib(['[SubsPlease] Test Show - 01 (1080p).mkv']);
    const db = createDb(':memory:');
    await scanLibrary(db, dir, fakeOps);
    await scanLibrary(db, dir, fakeOps);
    expect(db.prepare('SELECT COUNT(*) c FROM media').get()).toEqual({ c: 1 });
  });

  it('prefers external .srt/.ass file over embedded', async () => {
    const dir = tmpLib(['Show - 02.mkv', 'Show - 02.ja.srt']);
    fs.writeFileSync(path.join(dir, 'Show - 02.ja.srt'), '1\n00:00:01,000 --> 00:00:02,000\nこんにちは\n');
    const db = createDb(':memory:');
    await scanLibrary(db, dir, fakeOps);
    const sub: any = db.prepare('SELECT * FROM subtitle_file').get();
    expect(sub.format).toBe('srt');
    expect(sub.file_path.endsWith('.srt')).toBe(true);
  });

  it('recursively imports a season folder and finds its same-directory subtitle', async () => {
    const dir = tmpLib([]);
    const seasonDir = path.join(dir, 'Show Season 1');
    fs.mkdirSync(seasonDir);
    fs.writeFileSync(path.join(seasonDir, 'Show - 01.mkv'), 'video');
    fs.writeFileSync(path.join(seasonDir, 'Show - 01.ja.srt'), 'subtitle');
    const db = createDb(':memory:');

    await scanLibrary(db, dir, fakeOps);

    const media: any = db.prepare('SELECT * FROM media').get();
    expect(media.file_path).toBe(path.join(seasonDir, 'Show - 01.mkv'));
    const sub: any = db.prepare('SELECT * FROM subtitle_file').get();
    expect(sub.file_path).toBe(path.join(seasonDir, 'Show - 01.ja.srt'));
  });

  it('remuxes hevc without re-encoding video', async () => {
    const dir = tmpLib(['Show - 03.mkv']);
    const db = createDb(':memory:');
    const hevcOps: FfmpegOps = {
      ...fakeOps,
      probe: async () => ({
        streams: [{ index: 0, codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le' }],
      }),
    };
    await scanLibrary(db, dir, hevcOps);
    const media: any = db.prepare('SELECT * FROM media').get();
    expect(media.codec_status).toBe('remuxed');
    expect(fs.existsSync(media.playable_path)).toBe(true);
  });

  it('repairs an existing transcode_needed row when the codec becomes remuxable', async () => {
    const dir = tmpLib(['Show - 04.mkv']);
    const file = path.join(dir, 'Show - 04.mkv');
    const db = createDb(':memory:');
    const id = Number(db.prepare(`
      INSERT INTO media (series, episode, file_path, codec_status)
      VALUES ('Show', 4, ?, 'transcode_needed')
    `).run(file).lastInsertRowid);
    const hevcOps: FfmpegOps = {
      ...fakeOps,
      probe: async () => ({
        streams: [{ index: 0, codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le' }],
      }),
    };

    const result = await scanLibrary(db, dir, hevcOps);

    expect(result.importedIds).toEqual([id]);
    const media: any = db.prepare('SELECT * FROM media WHERE id=?').get(id);
    expect(media.codec_status).toBe('remuxed');
    expect(fs.existsSync(media.playable_path)).toBe(true);
  });

  it('does not record probe failures and can import the file on retry', async () => {
    const dir = tmpLib(['Show - 04.mkv']);
    const db = createDb(':memory:');
    let fail = true;
    const retryOps: FfmpegOps = {
      ...fakeOps,
      probe: async (file) => {
        if (fail) throw new Error(`incomplete: ${file}`);
        return fakeOps.probe(file);
      },
    };

    const first = await scanLibrary(db, dir, retryOps);
    expect(first.importedIds).toEqual([]);
    expect(first.failedFiles).toEqual([path.join(dir, 'Show - 04.mkv')]);
    expect(db.prepare('SELECT COUNT(*) c FROM media').get()).toEqual({ c: 0 });

    fail = false;
    const second = await scanLibrary(db, dir, retryOps);
    expect(second.importedIds).toHaveLength(1);
    expect(second.failedFiles).toEqual([]);
  });
});
