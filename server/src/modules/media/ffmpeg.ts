import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface ProbeStream {
  index: number;
  codec_type: string;
  codec_name: string;
  pix_fmt?: string;
  tags?: { language?: string };
}
export interface ProbeResult {
  streams: ProbeStream[];
}

export type Playability = 'direct' | 'remux' | 'transcode_needed';

const BROWSER_VIDEO = new Set(['h264', 'hevc', 'vp9', 'av1']);
const TEXT_SUB = new Set(['ass', 'ssa', 'subrip', 'srt']);

export function decidePlayability(probe: ProbeResult, ext: string): Playability {
  const v = probe.streams.find((s) => s.codec_type === 'video');
  if (!v || !BROWSER_VIDEO.has(v.codec_name)) return 'transcode_needed';
  if (v.codec_name !== 'hevc' && v.pix_fmt && /10le|10be|12le/.test(v.pix_fmt)) {
    return 'transcode_needed';
  }
  return ext.toLowerCase() === '.mp4' ? 'direct' : 'remux';
}

export function buildRemuxArgs(input: string, output: string): string[] {
  return ['-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output];
}

export function pickSubtitleStream(probe: ProbeResult): { index: number; codec: string } | null {
  const subs = probe.streams.filter((s) => s.codec_type === 'subtitle' && TEXT_SUB.has(s.codec_name));
  const jpn = subs.find((s) => s.tags?.language === 'jpn');
  return jpn ? { index: jpn.index, codec: jpn.codec_name } : null;
}

export function buildExtractSubArgs(input: string, streamIndex: number, output: string): string[] {
  return ['-y', '-i', input, '-map', `0:${streamIndex}`, output];
}

// ---- プロセス実行（結合テストで検証、単体テスト対象外）----

export async function probeFile(file: string): Promise<ProbeResult> {
  const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', file]);
  return JSON.parse(stdout) as ProbeResult;
}

export async function runFfmpeg(args: string[]): Promise<void> {
  await execFileP('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });
}
