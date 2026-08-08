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

export interface ScanResult {
  importedIds: number[];
  failedFiles: string[];
}

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

export function listSourceVideos(mediaDir: string): string[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (
        entry.isFile()
        && VIDEO_EXT.has(path.extname(entry.name).toLowerCase())
        && !entry.name.toLowerCase().endsWith('.play.mp4')
      ) {
        files.push(full);
      }
    }
  };

  fs.mkdirSync(mediaDir, { recursive: true });
  visit(mediaDir);
  return files;
}

export async function scanFiles(
  db: Db,
  mediaDir: string,
  filePaths: string[],
  ops: FfmpegOps = realOps,
  platform: NodeJS.Platform = process.platform,
): Promise<ScanResult> {
  const importedIds: number[] = [];
  const failedFiles: string[] = [];
  const root = path.resolve(mediaDir);

  for (const filePath of filePaths) {
    const full = path.resolve(filePath);
    const relative = path.relative(root, full);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    const file = path.basename(full);
    if (!VIDEO_EXT.has(path.extname(file).toLowerCase())) continue;
    if (file.endsWith('.play.mp4')) continue; // 自前で生成した再生用ファイル
    const existing = db.prepare('SELECT id, codec_status FROM media WHERE file_path=?').get(full) as
      { id: number; codec_status: string } | undefined;
    if (existing && existing.codec_status !== 'transcode_needed') continue;

    const ext = path.extname(file).toLowerCase();
    const { series, episode } = parseFilename(file);

    let probe: ProbeResult;
    try {
      probe = await ops.probe(full);
    } catch {
      failedFiles.push(full);
      continue;
    }

    const playability = decidePlayability(probe, ext, platform);
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
        failedFiles.push(full);
      }
    }

    if (existing) {
      if (status === 'transcode_needed') continue;
      db.prepare('UPDATE media SET playable_path=?, codec_status=? WHERE id=?')
        .run(playablePath, status, existing.id);
      importedIds.push(existing.id);
      continue;
    }

    const info = db.prepare(`INSERT INTO media (series, episode, file_path, playable_path, codec_status) VALUES (?,?,?,?,?)`)
      .run(series, episode, full, playablePath, status);
    const mediaId = info.lastInsertRowid as number;
    importedIds.push(Number(mediaId));

    // 字幕: 外部ファイル優先、なければ内蔵から抽出
    const videoBase = file.slice(0, -ext.length);
    const external = findExternalSub(path.dirname(full), videoBase);
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

  return { importedIds, failedFiles };
}

export async function scanLibrary(
  db: Db,
  mediaDir: string,
  ops: FfmpegOps = realOps,
  platform: NodeJS.Platform = process.platform,
): Promise<ScanResult> {
  return scanFiles(db, mediaDir, listSourceVideos(mediaDir), ops, platform);
}
