import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../../db.js';
import { parseFilename } from './filename.js';
import {
  decidePlayability, buildRemuxArgs, buildExtractSubArgs, pickSubtitleStream,
  probeFile, runFfmpeg, type ProbeResult,
} from './ffmpeg.js';

export interface FfmpegOps {
  probe(file: string): Promise<ProbeResult>;
  remux(input: string, output: string): Promise<void>;
  extractSub(input: string, streamIndex: number, output: string): Promise<void>;
}

export const realOps: FfmpegOps = {
  probe: probeFile,
  remux: (i, o) => runFfmpeg(buildRemuxArgs(i, o)),
  extractSub: (i, s, o) => runFfmpeg(buildExtractSubArgs(i, s, o)),
};

const VIDEO_EXT = new Set(['.mkv', '.mp4']);
const SUB_EXT = new Set(['.srt', '.ass']);

function findExternalSub(dir: string, videoBase: string): string | null {
  const entries = fs.readdirSync(dir);
  for (const e of entries) {
    const ext = path.extname(e).toLowerCase();
    if (!SUB_EXT.has(ext)) continue;
    // "Show - 02.ja.srt" は "Show - 02" にマッチ
    const subBase = e.slice(0, -ext.length).replace(/\.(ja|jpn|jp)$/i, '');
    if (subBase === videoBase) return path.join(dir, e);
  }
  return null;
}

export async function scanLibrary(db: Db, mediaDir: string, ops: FfmpegOps = realOps): Promise<void> {
  fs.mkdirSync(mediaDir, { recursive: true });
  const files = fs.readdirSync(mediaDir).filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));

  for (const file of files) {
    if (file.endsWith('.play.mp4')) continue; // 自前で生成した再生用ファイル
    const full = path.join(mediaDir, file);
    const exists = db.prepare('SELECT id FROM media WHERE file_path=?').get(full);
    if (exists) continue;

    const ext = path.extname(file).toLowerCase();
    const { series, episode } = parseFilename(file);

    let probe: ProbeResult;
    try {
      probe = await ops.probe(full);
    } catch {
      db.prepare(`INSERT INTO media (series, episode, file_path, codec_status) VALUES (?,?,?,?)`)
        .run(series, episode, full, 'unknown');
      continue;
    }

    const playability = decidePlayability(probe, ext);
    let playablePath: string | null = null;
    let status: string = playability === 'direct' ? 'direct' : playability;

    if (playability === 'direct') {
      playablePath = full;
    } else if (playability === 'remux') {
      playablePath = full.replace(/\.[^.]+$/, '') + '.play.mp4';
      try {
        await ops.remux(full, playablePath);
        status = 'remuxed';
      } catch {
        playablePath = null;
        status = 'transcode_needed';
      }
    }

    const info = db.prepare(`INSERT INTO media (series, episode, file_path, playable_path, codec_status) VALUES (?,?,?,?,?)`)
      .run(series, episode, full, playablePath, status);
    const mediaId = info.lastInsertRowid as number;

    // 字幕: 外部ファイル優先、なければ内蔵から抽出
    const videoBase = file.slice(0, -ext.length);
    const external = findExternalSub(mediaDir, videoBase);
    if (external) {
      const fmt = path.extname(external).slice(1).toLowerCase();
      db.prepare(`INSERT INTO subtitle_file (media_id, file_path, format) VALUES (?,?,?)`).run(mediaId, external, fmt);
    } else {
      const stream = pickSubtitleStream(probe);
      if (stream) {
        const fmt = stream.codec === 'subrip' || stream.codec === 'srt' ? 'srt' : 'ass';
        const out = full.replace(/\.[^.]+$/, '') + `.extracted.${fmt}`;
        try {
          await ops.extractSub(full, stream.index, out);
          db.prepare(`INSERT INTO subtitle_file (media_id, file_path, format) VALUES (?,?,?)`).run(mediaId, out, fmt);
        } catch { /* 字幕なし。再生ページ側で案内 */ }
      }
    }
  }
}
