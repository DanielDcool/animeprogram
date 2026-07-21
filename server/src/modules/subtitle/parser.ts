export interface Cue {
  start: number;
  end: number;
  text: string;
}

function srtTime(t: string): number {
  const m = t.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) throw new Error(`bad srt time: ${t}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
}

export function parseSrt(content: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = content.replace(/^﻿/, '').replace(/\r\n/g, '\n').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [startRaw, endRaw] = lines[timeIdx].split('-->');
    const text = lines
      .slice(timeIdx + 1)
      .map((l) => l.replace(/<[^>]+>/g, '').trim())
      .filter((l) => l !== '')
      .join(' ');
    if (text === '') continue;
    cues.push({ start: srtTime(startRaw), end: srtTime(endRaw), text });
  }
  return cues;
}

function assTime(t: string): number {
  const m = t.trim().match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) throw new Error(`bad ass time: ${t}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
}

export function parseAss(content: string): Cue[] {
  const lines = content.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  let format: string[] | null = null;
  const cues: Cue[] = [];
  for (const line of lines) {
    if (line.startsWith('Format:')) {
      format = line.slice(7).split(',').map((s) => s.trim());
    } else if (line.startsWith('Dialogue:') && format) {
      // Text は最終列でカンマを含みうる → 先頭 n-1 列だけ split
      const values = line.slice(9).split(',');
      const head = values.slice(0, format.length - 1);
      const text = values.slice(format.length - 1).join(',');
      const get = (name: string) => head[format!.indexOf(name)];
      const clean = text
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\[Nn]/g, ' ')
        .replace(/\\h/g, ' ')
        .trim();
      if (clean === '') continue;
      cues.push({ start: assTime(get('Start')), end: assTime(get('End')), text: clean });
    }
  }
  return cues;
}

export function parseSubtitle(content: string, format: 'srt' | 'ass'): Cue[] {
  const cues = format === 'srt' ? parseSrt(content) : parseAss(content);
  return cues.sort((a, b) => a.start - b.start);
}
