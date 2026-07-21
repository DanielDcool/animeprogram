# 日语学习动画播放器 MVP — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本地 Web 应用：播放本地番剧视频（含 mkv remux），默认隐藏字幕，快捷键暂停/回看/显示当前句，右侧面板本地分词查词 + Claude API 深度讲解。

**Architecture:** npm workspaces 双包 monorepo。`server/`（Fastify + better-sqlite3 + kuromoji + JMdict + Anthropic SDK）提供 REST API 与视频 Range 流；`web/`（Vite + React）提供媒体库页/播放页/设置页。学习模式状态机为纯 reducer，前端 hook 包装。

**Tech Stack:** Node 22, TypeScript, Fastify 5, better-sqlite3, kuromoji, @anthropic-ai/sdk, vitest, React 18, Vite 6。本机已装 ffmpeg 8.1。

**Spec:** `docs/superpowers/specs/2026-07-21-jp-learning-player-design.md`

**约定：** 所有命令在 `/Users/daniel/study/animeprogram` 仓库根目录执行，除非另有说明。每个任务结束时 `git add -A && git commit`。

---

## File Structure

```
package.json                    # workspaces root, npm start 脚本
.gitignore
server/
  package.json  tsconfig.json  vitest.config.ts
  src/
    index.ts                    # Fastify 启动、路由注册
    config.ts                   # 端口、媒体库目录、数据目录
    db.ts                       # SQLite 打开 + schema
    modules/
      subtitle/parser.ts        # srt/ass → Cue[]
      subtitle/routes.ts        # GET subtitles / PUT offset
      media/filename.ts         # 文件名 → {series, episode}
      media/ffmpeg.ts           # ffprobe/remux/抽字幕 命令封装
      media/scanner.ts          # 扫描媒体库、导入
      media/routes.ts           # GET /api/media, POST /api/media/scan, GET stream
      analyze/tokenizer.ts      # kuromoji 封装
      analyze/dictionary.ts     # JMdict 查词
      analyze/routes.ts         # POST /api/analyze
      ai/explain.ts             # Claude API 讲解 + 缓存
      ai/routes.ts              # POST /api/explain
      misc/routes.ts            # progress + settings
  scripts/import-jmdict.ts      # JMdict JSON → SQLite（一次性）
  test/                         # vitest 单测（每模块一个文件）
  data/                         # SQLite 文件（gitignore）
web/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/
    main.tsx  App.tsx  api.ts  types.ts
    pages/LibraryPage.tsx  pages/PlayerPage.tsx  pages/SettingsPage.tsx
    player/learningMode.ts      # 纯 reducer（可单测）
    player/SubtitleOverlay.tsx  player/AnalysisPanel.tsx
  test/learningMode.test.ts
```

各文件职责单一：parser 不碰文件系统，scanner 不碰 HTTP，ffmpeg.ts 的命令构建与进程执行分离（便于单测命令、mock 执行）。

---

## Task 1: Monorepo 脚手架 + server 启动 + vitest

**Files:**
- Create: `package.json`, `.gitignore`, `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/config.ts`, `server/src/index.ts`, `server/test/smoke.test.ts`

- [ ] **Step 1: 根 package.json 与 .gitignore**

`package.json`:
```json
{
  "name": "animeprogram",
  "private": true,
  "workspaces": ["server", "web"],
  "scripts": {
    "start": "npm run dev -w server & npm run dev -w web & wait",
    "test": "npm test -w server && npm test -w web"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
server/data/
server/vendor/
*.log
.DS_Store
```

- [ ] **Step 2: server 包**

`server/package.json`:
```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "import-jmdict": "tsx scripts/import-jmdict.ts"
  }
}
```

安装依赖：
```bash
npm install -w server fastify @fastify/cors better-sqlite3 kuromoji @anthropic-ai/sdk
npm install -w server -D typescript tsx vitest @types/node @types/better-sqlite3 @types/kuromoji stream-json @types/stream-json
```

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "scripts", "test"]
}
```

`server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 3: config.ts 与 index.ts**

`server/src/config.ts`:
```ts
import os from 'node:os';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  mediaDir: process.env.MEDIA_DIR ?? path.join(os.homedir(), 'AnimeLibrary'),
  dataDir: process.env.DATA_DIR ?? path.join(import.meta.dirname, '..', 'data'),
};
```

`server/src/index.ts`（后续任务会往 buildApp 里加路由注册）:
```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  app.get('/api/health', async () => ({ ok: true }));
  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const app = await buildApp();
  app.listen({ port: config.port, host: '127.0.0.1' });
}
```

- [ ] **Step 4: 写冒烟测试**

`server/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/index.js';

describe('app', () => {
  it('health returns ok', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -w server`
Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: monorepo scaffold with fastify server and vitest"
```

---

## Task 2: SQLite 层与 schema

**Files:**
- Create: `server/src/db.ts`
- Test: `server/test/db.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/db.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createDb } from '../src/db.js';

describe('createDb', () => {
  it('creates all tables', () => {
    const db = createDb(':memory:');
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r: any) => r.name);
    for (const t of ['media', 'subtitle_file', 'progress', 'explain_cache', 'settings', 'dict']) {
      expect(names).toContain(t);
    }
  });

  it('settings get/set roundtrip', () => {
    const db = createDb(':memory:');
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .run('anthropic_api_key', 'sk-test');
    const row: any = db.prepare(`SELECT value FROM settings WHERE key=?`).get('anthropic_api_key');
    expect(row.value).toBe('sk-test');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w server`
Expected: FAIL — cannot find `../src/db.js`

- [ ] **Step 3: 实现 db.ts**

```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

export function createDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series TEXT NOT NULL,
      episode REAL,
      file_path TEXT NOT NULL UNIQUE,
      playable_path TEXT,
      codec_status TEXT NOT NULL DEFAULT 'unknown', -- direct | remuxed | transcode_needed | unknown
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subtitle_file (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL REFERENCES media(id),
      file_path TEXT NOT NULL,
      format TEXT NOT NULL,           -- srt | ass
      offset_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS progress (
      media_id INTEGER PRIMARY KEY REFERENCES media(id),
      position_sec REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS explain_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence_hash TEXT NOT NULL UNIQUE,
      sentence_text TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dict (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kanji TEXT,
      kana TEXT NOT NULL,
      gloss TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dict_kanji ON dict(kanji);
    CREATE INDEX IF NOT EXISTS idx_dict_kana ON dict(kana);
  `);
  return db;
}

export function getSetting(db: Db, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -w server` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): sqlite schema and settings helpers"
```

---

## Task 3: 字幕解析（SRT + ASS）

**Files:**
- Create: `server/src/modules/subtitle/parser.ts`
- Test: `server/test/subtitle-parser.test.ts`

统一输出类型：`Cue = { start: number; end: number; text: string }`（秒，浮点）。

- [ ] **Step 1: 写失败测试（SRT）**

`server/test/subtitle-parser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseSrt, parseAss, parseSubtitle } from '../src/modules/subtitle/parser.js';

const SRT = `1
00:00:01,500 --> 00:00:03,200
それでも、あたしは

2
00:00:03,400 --> 00:00:05,000
<i>あんたのことが</i>
好きなんだよ
`;

describe('parseSrt', () => {
  it('parses cues with times and joined text', () => {
    const cues = parseSrt(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1.5, end: 3.2, text: 'それでも、あたしは' });
    expect(cues[1].start).toBeCloseTo(3.4);
    expect(cues[1].text).toBe('あんたのことが 好きなんだよ'); // html 标签去除，换行合并为空格
  });

  it('tolerates \\r\\n and BOM', () => {
    const cues = parseSrt('﻿' + SRT.replace(/\n/g, '\r\n'));
    expect(cues).toHaveLength(2);
  });
});

const ASS = `[Script Info]
Title: test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.50,0:00:03.20,Default,,0,0,0,,{\\an8}それでも、あたしは
Dialogue: 0,0:00:03.40,0:00:05.00,Default,,0,0,0,,あんたのことが\\Nすきなんだよ
Comment: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,これは出ない
`;

describe('parseAss', () => {
  it('parses Dialogue lines, strips override tags, \\N becomes space', () => {
    const cues = parseAss(ASS);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1.5, end: 3.2, text: 'それでも、あたしは' });
    expect(cues[1].text).toBe('あんたのことが すきなんだよ');
  });
});

describe('parseSubtitle', () => {
  it('dispatches by extension and sorts by start', () => {
    expect(parseSubtitle(SRT, 'srt')[0].start).toBe(1.5);
    expect(parseSubtitle(ASS, 'ass')[0].start).toBe(1.5);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w server` — Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 parser.ts**

```ts
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
      // Text 是最后一列，可能内含逗号 → 只 split 前 n-1 次
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -w server` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): srt/ass subtitle parser"
```

---

## Task 4: 文件名解析（series / episode）

**Files:**
- Create: `server/src/modules/media/filename.ts`
- Test: `server/test/filename.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/filename.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseFilename } from '../src/modules/media/filename.js';

describe('parseFilename', () => {
  it.each([
    ['[SubsPlease] Yagate Kimi ni Naru - 05 (1080p) [ABCD1234].mkv', 'Yagate Kimi ni Naru', 5],
    ['[Erai-raws] Adachi to Shimamura - 12 END [1080p].mkv', 'Adachi to Shimamura', 12],
    ['Aoi Hana - 03v2 [BD 1080p].mkv', 'Aoi Hana', 3],
    ['citrus 第08話.mp4', 'citrus', 8],
    ['My Movie (2020).mp4', 'My Movie (2020)', null],
  ])('%s -> %s ep %s', (input, series, episode) => {
    expect(parseFilename(input)).toEqual({ series, episode });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w server` — Expected: FAIL

- [ ] **Step 3: 实现 filename.ts**

```ts
export interface ParsedName {
  series: string;
  episode: number | null;
}

export function parseFilename(fileName: string): ParsedName {
  let base = fileName.replace(/\.[^.]+$/, '');
  // 去掉开头的字幕组标签与结尾的 hash/清晰度括号组
  base = base.replace(/^\[[^\]]*\]\s*/, '');
  base = base.replace(/\s*[[(][^\])]*[\])]\s*$/g, '');
  while (/\s*[[(][^\])]*[\])]\s*$/.test(base)) {
    base = base.replace(/\s*[[(][^\])]*[\])]\s*$/, '');
  }

  // "Series - 05" / "Series - 05v2" / "Series - 12 END"
  let m = base.match(/^(.*?)\s*-\s*(\d{1,3}(?:\.\d)?)(?:v\d+)?(?:\s+END)?\s*$/i);
  if (m) return { series: m[1].trim(), episode: Number(m[2]) };

  // "Series 第08話"
  m = base.match(/^(.*?)\s*第\s*(\d{1,3})\s*話?\s*$/);
  if (m) return { series: m[1].trim(), episode: Number(m[2]) };

  // 括号内容属于标题本身的情况（如电影年份）：还原原始 base
  const original = fileName.replace(/\.[^.]+$/, '').replace(/^\[[^\]]*\]\s*/, '');
  return { series: original.trim(), episode: null };
}
```

注意：最后一个用例 `My Movie (2020).mp4` 期望保留括号 —— 实现里 episode 匹配失败时回退到未剥括号的名字。若测试因剥括号顺序失败，按测试期望修正实现（测试是行为契约）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -w server` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): media filename parser"
```

---

## Task 5: ffmpeg 封装（probe / remux / 抽字幕）

**Files:**
- Create: `server/src/modules/media/ffmpeg.ts`
- Test: `server/test/ffmpeg.test.ts`

命令构建为纯函数（单测覆盖），进程执行单独封装（不单测，集成时验证）。

- [ ] **Step 1: 写失败测试**

`server/test/ffmpeg.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decidePlayability, buildRemuxArgs, buildExtractSubArgs, pickSubtitleStream } from '../src/modules/media/ffmpeg.js';

const h264mkv = {
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
    { index: 1, codec_type: 'audio', codec_name: 'flac' },
    { index: 2, codec_type: 'subtitle', codec_name: 'ass', tags: { language: 'jpn' } },
  ],
};

describe('decidePlayability', () => {
  it('h264 mkv -> remux', () => {
    expect(decidePlayability(h264mkv as any, '.mkv')).toBe('remux');
  });
  it('h264 mp4 -> direct', () => {
    expect(decidePlayability(h264mkv as any, '.mp4')).toBe('direct');
  });
  it('hevc -> transcode_needed', () => {
    const probe = { streams: [{ index: 0, codec_type: 'video', codec_name: 'hevc' }] };
    expect(decidePlayability(probe as any, '.mkv')).toBe('transcode_needed');
  });
  it('10bit h264 -> transcode_needed', () => {
    const probe = { streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p10le' }] };
    expect(decidePlayability(probe as any, '.mkv')).toBe('transcode_needed');
  });
});

describe('buildRemuxArgs', () => {
  it('copies video, re-encodes audio to aac, drops subs', () => {
    const args = buildRemuxArgs('/in.mkv', '/out.mp4');
    expect(args).toEqual(['-y', '-i', '/in.mkv', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '/out.mp4']);
  });
});

describe('pickSubtitleStream', () => {
  it('prefers jpn text subtitle', () => {
    expect(pickSubtitleStream(h264mkv as any)).toEqual({ index: 2, codec: 'ass' });
  });
  it('returns null when none', () => {
    expect(pickSubtitleStream({ streams: [] } as any)).toBeNull();
  });
});

describe('buildExtractSubArgs', () => {
  it('extracts given stream to ass file', () => {
    expect(buildExtractSubArgs('/in.mkv', 2, '/out.ass')).toEqual(['-y', '-i', '/in.mkv', '-map', '0:2', '/out.ass']);
  });
});
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 ffmpeg.ts**

```ts
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

const BROWSER_VIDEO = new Set(['h264', 'vp9', 'av1']);
const TEXT_SUB = new Set(['ass', 'ssa', 'subrip', 'srt']);

export function decidePlayability(probe: ProbeResult, ext: string): Playability {
  const v = probe.streams.find((s) => s.codec_type === 'video');
  if (!v || !BROWSER_VIDEO.has(v.codec_name)) return 'transcode_needed';
  if (v.pix_fmt && /10le|10be|12le/.test(v.pix_fmt)) return 'transcode_needed';
  return ext.toLowerCase() === '.mp4' ? 'direct' : 'remux';
}

export function buildRemuxArgs(input: string, output: string): string[] {
  return ['-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output];
}

export function pickSubtitleStream(probe: ProbeResult): { index: number; codec: string } | null {
  const subs = probe.streams.filter((s) => s.codec_type === 'subtitle' && TEXT_SUB.has(s.codec_name));
  if (subs.length === 0) return null;
  const jpn = subs.find((s) => s.tags?.language === 'jpn');
  const chosen = jpn ?? subs[0];
  return { index: chosen.index, codec: chosen.codec };
}

export function buildExtractSubArgs(input: string, streamIndex: number, output: string): string[] {
  return ['-y', '-i', input, '-map', `0:${streamIndex}`, output];
}

// ---- 进程执行（集成路径，不做单测）----

export async function probeFile(file: string): Promise<ProbeResult> {
  const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', file]);
  return JSON.parse(stdout) as ProbeResult;
}

export async function runFfmpeg(args: string[]): Promise<void> {
  await execFileP('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });
}
```

- [ ] **Step 4: 运行测试确认通过** — Run: `npm test -w server`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): ffmpeg probe/remux command builders"
```

---

## Task 6: 媒体库扫描器

**Files:**
- Create: `server/src/modules/media/scanner.ts`
- Test: `server/test/scanner.test.ts`

scanner 通过依赖注入接收 probe/remux 实现，测试里用 fake，不真正跑 ffmpeg。

- [ ] **Step 1: 写失败测试**

`server/test/scanner.test.ts`:
```ts
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

  it('marks hevc as transcode_needed without remux', async () => {
    const dir = tmpLib(['Show - 03.mkv']);
    const db = createDb(':memory:');
    const hevcOps: FfmpegOps = { ...fakeOps, probe: async () => ({ streams: [{ index: 0, codec_type: 'video', codec_name: 'hevc' }] }) };
    await scanLibrary(db, dir, hevcOps);
    const media: any = db.prepare('SELECT * FROM media').get();
    expect(media.codec_status).toBe('transcode_needed');
    expect(media.playable_path).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 scanner.ts**

```ts
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
    // "Show - 02.ja.srt" 匹配 "Show - 02"
    const subBase = e.slice(0, -ext.length).replace(/\.(ja|jpn|jp)$/i, '');
    if (subBase === videoBase) return path.join(dir, e);
  }
  return null;
}

export async function scanLibrary(db: Db, mediaDir: string, ops: FfmpegOps = realOps): Promise<void> {
  fs.mkdirSync(mediaDir, { recursive: true });
  const files = fs.readdirSync(mediaDir).filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));

  for (const file of files) {
    if (file.endsWith('.play.mp4')) continue; // 我们自己生成的产物
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
    let status = playability === 'direct' ? 'direct' : playability;

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

    // 字幕：外部文件优先，其次抽取内嵌
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
        } catch { /* 无字幕可用，播放页会提示 */ }
      }
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过** — Run: `npm test -w server`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): media library scanner with remux and subtitle import"
```

---

## Task 7: media 路由（列表 / 扫描 / Range 流）

**Files:**
- Create: `server/src/modules/media/routes.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/media-routes.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/media-routes.test.ts`:
```ts
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
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 routes.ts**

```ts
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { scanLibrary, realOps, type FfmpegOps } from './scanner.js';

interface Opts {
  db: Db;
  mediaDir: string;
  ops?: FfmpegOps;
}

export async function mediaRoutes(app: FastifyInstance, opts: Opts) {
  const { db, mediaDir, ops = realOps } = opts;

  app.get('/api/media', async () => {
    const rows = db.prepare(`
      SELECT m.id, m.series, m.episode, m.file_path, m.codec_status, m.playable_path,
             COALESCE(p.position_sec, 0) AS position_sec,
             EXISTS(SELECT 1 FROM subtitle_file s WHERE s.media_id = m.id) AS has_subtitle
      FROM media m LEFT JOIN progress p ON p.media_id = m.id
      ORDER BY m.series, m.episode
    `).all() as any[];
    return rows.map((r) => ({
      id: r.id, series: r.series, episode: r.episode,
      codecStatus: r.codec_status, playable: r.playable_path != null,
      hasSubtitle: !!r.has_subtitle, positionSec: r.position_sec,
    }));
  });

  app.post('/api/media/scan', async () => {
    await scanLibrary(db, mediaDir, ops);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/media/:id/stream', async (req, reply) => {
    const row = db.prepare('SELECT playable_path FROM media WHERE id=?').get(req.params.id) as { playable_path: string | null } | undefined;
    if (!row?.playable_path || !fs.existsSync(row.playable_path)) {
      return reply.code(404).send({ error: 'not playable' });
    }
    const file = row.playable_path;
    const size = fs.statSync(file).size;
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      const start = m && m[1] ? Number(m[1]) : 0;
      const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      reply.code(206)
        .header('content-range', `bytes ${start}-${end}/${size}`)
        .header('accept-ranges', 'bytes')
        .header('content-length', end - start + 1)
        .header('content-type', 'video/mp4');
      return reply.send(fs.createReadStream(file, { start, end }));
    }
    reply.header('content-length', size).header('accept-ranges', 'bytes').header('content-type', 'video/mp4');
    return reply.send(fs.createReadStream(file));
  });
}
```

- [ ] **Step 4: 在 index.ts 注册**

`buildApp` 中（`app.get('/api/health'...)` 之后）加：
```ts
import path from 'node:path';
import { createDb } from './db.js';
import { mediaRoutes } from './modules/media/routes.js';
// buildApp 内：
const db = createDb(path.join(config.dataDir, 'library.db'));
app.decorate('db', db);
await app.register(mediaRoutes, { db, mediaDir: config.mediaDir });
```
并在文件顶部加类型扩展：
```ts
declare module 'fastify' {
  interface FastifyInstance { db: import('./db.js').Db }
}
```

- [ ] **Step 5: 运行测试确认通过** — Run: `npm test -w server`（smoke 测试也仍需通过）

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(server): media list/scan routes and range streaming"
```

---

## Task 8: 字幕路由（获取句子列表 / 调偏移）

**Files:**
- Create: `server/src/modules/subtitle/routes.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/subtitle-routes.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/subtitle-routes.test.ts`:
```ts
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
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 routes.ts**

```ts
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { parseSubtitle } from './parser.js';

export async function subtitleRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get<{ Params: { id: string } }>('/api/media/:id/subtitles', async (req, reply) => {
    const sub = db.prepare('SELECT * FROM subtitle_file WHERE media_id=?').get(req.params.id) as any;
    if (!sub || !fs.existsSync(sub.file_path)) return reply.code(404).send({ error: 'no subtitle' });
    const cues = parseSubtitle(fs.readFileSync(sub.file_path, 'utf8'), sub.format);
    const offset = sub.offset_ms / 1000;
    return {
      offsetMs: sub.offset_ms,
      cues: cues.map((c) => ({ start: c.start + offset, end: c.end + offset, text: c.text })),
    };
  });

  app.put<{ Params: { id: string }; Body: { offsetMs: number } }>(
    '/api/media/:id/subtitle-offset',
    async (req, reply) => {
      const info = db.prepare('UPDATE subtitle_file SET offset_ms=? WHERE media_id=?')
        .run(Math.round(req.body.offsetMs), req.params.id);
      if (info.changes === 0) return reply.code(404).send({ error: 'no subtitle' });
      return { ok: true };
    },
  );
}
```

- [ ] **Step 4: 在 index.ts 注册** — `await app.register(subtitleRoutes, { db });`

- [ ] **Step 5: 运行测试确认通过** — Run: `npm test -w server`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(server): subtitle cues api with offset adjustment"
```

---

## Task 9: 分词器（kuromoji）

**Files:**
- Create: `server/src/modules/analyze/tokenizer.ts`
- Test: `server/test/tokenizer.test.ts`

kuromoji 词典随 npm 包分发（`node_modules/kuromoji/dict`），首次加载 ~1s，做成惰性单例。

- [ ] **Step 1: 写失败测试**

`server/test/tokenizer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/modules/analyze/tokenizer.js';

describe('tokenize', () => {
  it('tokenizes a sentence with base form and hiragana reading', async () => {
    const tokens = await tokenize('あんたのことが好きなんだよ');
    const surfaces = tokens.map((t) => t.surface);
    expect(surfaces).toContain('あんた');
    expect(surfaces).toContain('好き');
    const suki = tokens.find((t) => t.surface === '好き')!;
    expect(suki.reading).toBe('すき');
    expect(suki.pos).toBe('名詞');
  });

  it('restores dictionary form of conjugated verbs', async () => {
    const tokens = await tokenize('食べた');
    const tabe = tokens.find((t) => t.surface === '食べ')!;
    expect(tabe.base).toBe('食べる');
    expect(tabe.pos).toBe('動詞');
  });
}, 30_000);
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 tokenizer.ts**

```ts
import kuromoji from 'kuromoji';
import path from 'node:path';
import { createRequire } from 'node:module';

export interface JaToken {
  surface: string;
  base: string;      // 辞书形
  reading: string;   // 平假名
  pos: string;       // 品詞大分类
  posDetail: string;
}

const require = createRequire(import.meta.url);
const DIC_DIR = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');

let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

function getTokenizer() {
  tokenizerPromise ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DIC_DIR }).build((err, tk) => (err ? reject(err) : resolve(tk)));
  });
  return tokenizerPromise;
}

function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export async function tokenize(text: string): Promise<JaToken[]> {
  const tk = await getTokenizer();
  return tk.tokenize(text).map((t) => ({
    surface: t.surface_form,
    base: t.basic_form === '*' ? t.surface_form : t.basic_form,
    reading: t.reading ? kataToHira(t.reading) : t.surface_form,
    pos: t.pos,
    posDetail: [t.pos_detail_1, t.conjugated_form].filter((x) => x && x !== '*').join('・'),
  }));
}
```

- [ ] **Step 4: 运行测试确认通过** — Run: `npm test -w server`（首次加载词典较慢属正常）

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): kuromoji tokenizer with base form and reading"
```

---

## Task 10: JMdict 词典（导入脚本 + 查询）

**Files:**
- Create: `server/src/modules/analyze/dictionary.ts`, `server/scripts/import-jmdict.ts`
- Test: `server/test/dictionary.test.ts`

数据源：[jmdict-simplified](https://github.com/scriptin/jmdict-simplified) 的 `jmdict-eng-*.json`（约 250MB，gitignore 的 `server/vendor/` 下）。导入用 stream-json 流式读，避免整读内存。测试用内嵌小 fixture，不依赖真实文件。

- [ ] **Step 1: 写失败测试**

`server/test/dictionary.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createDb } from '../src/db.js';
import { insertEntry, lookup } from '../src/modules/analyze/dictionary.js';

describe('dictionary', () => {
  it('looks up by kanji and by kana', () => {
    const db = createDb(':memory:');
    insertEntry(db, { kanji: ['好き'], kana: ['すき'], gloss: ['liking; being fond of'] });
    insertEntry(db, { kanji: [], kana: ['あんた'], gloss: ['you (informal)'] });

    expect(lookup(db, '好き')[0].gloss).toContain('liking');
    expect(lookup(db, 'すき')[0].gloss).toContain('liking');
    expect(lookup(db, 'あんた')[0].gloss).toContain('you');
    expect(lookup(db, '存在しない語')).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 dictionary.ts**

```ts
import type { Db } from '../../db.js';

export interface DictEntry {
  kanji: string[];
  kana: string[];
  gloss: string[];
}

export function insertEntry(db: Db, entry: DictEntry): void {
  const gloss = entry.gloss.join('; ');
  const stmt = db.prepare('INSERT INTO dict (kanji, kana, gloss) VALUES (?,?,?)');
  const kana = entry.kana[0] ?? '';
  if (entry.kanji.length === 0) {
    stmt.run(null, kana, gloss);
  } else {
    for (const k of entry.kanji) stmt.run(k, kana, gloss);
  }
}

export interface LookupResult { word: string; kana: string; gloss: string }

export function lookup(db: Db, term: string, limit = 5): LookupResult[] {
  const rows = db.prepare(
    `SELECT COALESCE(kanji, kana) AS word, kana, gloss FROM dict WHERE kanji = ? OR kana = ? LIMIT ?`,
  ).all(term, term, limit) as LookupResult[];
  return rows;
}
```

- [ ] **Step 4: 运行测试确认通过** — Run: `npm test -w server`

- [ ] **Step 5: 写导入脚本（不单测，运行验证）**

`server/scripts/import-jmdict.ts`:
```ts
// 用法：
//   1. 从 https://github.com/scriptin/jmdict-simplified/releases 下载 jmdict-eng-3.x.x.json.zip
//   2. 解压到 server/vendor/jmdict-eng.json
//   3. npm run import-jmdict -w server
import fs from 'node:fs';
import path from 'node:path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick.js';
import { streamArray } from 'stream-json/streamers/StreamArray.js';
import { createDb } from '../src/db.js';
import { insertEntry } from '../src/modules/analyze/dictionary.js';
import { config } from '../src/config.js';

const src = path.join(import.meta.dirname, '..', 'vendor', 'jmdict-eng.json');
if (!fs.existsSync(src)) {
  console.error(`missing ${src} — download jmdict-eng from jmdict-simplified releases first`);
  process.exit(1);
}

const db = createDb(path.join(config.dataDir, 'library.db'));
db.exec('DELETE FROM dict');
let count = 0;

const pipeline = chain([
  fs.createReadStream(src),
  parser(),
  pick({ filter: 'words' }),
  streamArray(),
]);

const insertMany = db.transaction((entries: any[]) => {
  for (const e of entries) {
    insertEntry(db, {
      kanji: e.kanji.map((k: any) => k.text),
      kana: e.kana.map((k: any) => k.text),
      gloss: e.sense.flatMap((s: any) => s.gloss.map((g: any) => g.text)).slice(0, 6),
    });
  }
});

let batch: any[] = [];
pipeline.on('data', ({ value }) => {
  batch.push(value);
  if (batch.length >= 5000) { insertMany(batch); count += batch.length; batch = []; }
});
pipeline.on('end', () => {
  insertMany(batch); count += batch.length;
  console.log(`imported ${count} entries`);
});
```

注：`stream-chain` 随 `stream-json` 一同安装（Task 1 已装 stream-json，它依赖 stream-chain；若 import 报错则 `npm install -w server stream-chain`）。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(server): jmdict dictionary lookup and import script"
```

---

## Task 11: /api/analyze 路由（分词 + 查词合并）

**Files:**
- Create: `server/src/modules/analyze/routes.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/analyze-routes.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/analyze-routes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createDb } from '../src/db.js';
import { insertEntry } from '../src/modules/analyze/dictionary.js';
import { analyzeRoutes } from '../src/modules/analyze/routes.js';

describe('POST /api/analyze', () => {
  it('returns tokens with dictionary glosses looked up by base form', async () => {
    const db = createDb(':memory:');
    insertEntry(db, { kanji: ['食べる'], kana: ['たべる'], gloss: ['to eat'] });
    const app = Fastify();
    app.register(analyzeRoutes, { db });

    const res = await app.inject({ method: 'POST', url: '/api/analyze', payload: { text: '食べた' } });
    expect(res.statusCode).toBe(200);
    const { tokens } = res.json();
    const tabe = tokens.find((t: any) => t.base === '食べる');
    expect(tabe.glosses[0].gloss).toBe('to eat');
  });

  it('400 on empty text', async () => {
    const app = Fastify();
    app.register(analyzeRoutes, { db: createDb(':memory:') });
    const res = await app.inject({ method: 'POST', url: '/api/analyze', payload: { text: '' } });
    expect(res.statusCode).toBe(400);
  });
}, 30_000);
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 routes.ts**

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { tokenize } from './tokenizer.js';
import { lookup } from './dictionary.js';

export async function analyzeRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.post<{ Body: { text: string } }>('/api/analyze', async (req, reply) => {
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: 'text required' });
    const tokens = await tokenize(text);
    return {
      tokens: tokens.map((t) => ({
        ...t,
        glosses: t.pos === '記号' ? [] : lookup(db, t.base),
      })),
    };
  });
}
```

- [ ] **Step 4: 在 index.ts 注册** — `await app.register(analyzeRoutes, { db });`

- [ ] **Step 5: 运行测试确认通过** — Run: `npm test -w server`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(server): analyze api combining tokenizer and dictionary"
```

---

## Task 12: AI 深度讲解（Claude API + 缓存）

**Files:**
- Create: `server/src/modules/ai/explain.ts`, `server/src/modules/ai/routes.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/explain.test.ts`

模型 `claude-opus-4-8`（settings 里 `ai_model` 可覆盖），adaptive thinking，structured outputs 保证 JSON。测试注入 fake client，不打真实 API。

- [ ] **Step 1: 写失败测试**

`server/test/explain.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { createDb } from '../src/db.js';
import { setSetting } from '../src/db.js';
import { explainSentence, type ExplainClient } from '../src/modules/ai/explain.js';
import { aiRoutes } from '../src/modules/ai/routes.js';

const EXPLANATION = {
  translation: '即便如此，我还是喜欢你啊。',
  structure: '「〜のことが好き」…',
  expressions: [{ expression: 'なんだよ', meaning: 'のだ＋よ，强调说明语气' }],
  nuance: '口语、亲密场合',
};

function fakeClient(): ExplainClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(EXPLANATION) }],
      }),
    },
  } as any;
}

describe('explainSentence', () => {
  it('parses structured response', async () => {
    const client = fakeClient();
    const result = await explainSentence(client, 'claude-opus-4-8', { text: 'それでも、あたしはあんたのことが好きなんだよ', context: [] });
    expect(result.translation).toContain('喜欢');
    expect((client.messages.create as any).mock.calls[0][0].model).toBe('claude-opus-4-8');
  });
});

describe('POST /api/explain', () => {
  it('caches by sentence: second call does not hit client', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'anthropic_api_key', 'sk-test');
    const client = fakeClient();
    const app = Fastify();
    app.register(aiRoutes, { db, clientFactory: () => client });

    const payload = { text: 'テスト文', context: ['前の文'] };
    const r1 = await app.inject({ method: 'POST', url: '/api/explain', payload });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().cached).toBe(false);

    const r2 = await app.inject({ method: 'POST', url: '/api/explain', payload });
    expect(r2.json().cached).toBe(true);
    expect((client.messages.create as any).mock.calls.length).toBe(1);
  });

  it('503 with code when api key not configured', async () => {
    const db = createDb(':memory:');
    const app = Fastify();
    app.register(aiRoutes, { db, clientFactory: () => fakeClient() });
    const res = await app.inject({ method: 'POST', url: '/api/explain', payload: { text: 'x' } });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('AI_NOT_CONFIGURED');
  });
});
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 explain.ts**

```ts
import type Anthropic from '@anthropic-ai/sdk';

// 只依赖用到的最小接口，便于测试注入
export type ExplainClient = Pick<Anthropic, 'messages'>;

export interface Explanation {
  translation: string;
  structure: string;
  expressions: { expression: string; meaning: string }[];
  nuance: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    translation: { type: 'string', description: '整句中文翻译' },
    structure: { type: 'string', description: '语法结构拆解（中文说明）' },
    expressions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['expression', 'meaning'],
        additionalProperties: false,
      },
      description: '句中的句型/惯用表达及说明',
    },
    nuance: { type: 'string', description: '语气、语境、使用场合' },
  },
  required: ['translation', 'structure', 'expressions', 'nuance'],
  additionalProperties: false,
} as const;

const SYSTEM = `あなたは日本語教師です。アニメの台詞を、日本語を勉強している中国語話者（N1レベル）向けに解説します。解説は中国語で書き、文法用語は必要に応じて日本語を併記してください。`;

export async function explainSentence(
  client: ExplainClient,
  model: string,
  input: { text: string; context: string[] },
): Promise<Explanation> {
  const contextBlock = input.context.length
    ? `前後の台詞（文脈参考用）:\n${input.context.join('\n')}\n\n`
    : '';
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA as any } },
    messages: [
      { role: 'user', content: `${contextBlock}解説対象の台詞:\n${input.text}` },
    ],
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('AI declined to answer');
  }
  const text = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
  if (!text) throw new Error('empty AI response');
  return JSON.parse(text.text) as Explanation;
}
```

- [ ] **Step 4: 实现 ai/routes.ts**

```ts
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';
import { getSetting, type Db } from '../../db.js';
import { explainSentence, type ExplainClient } from './explain.js';

interface Opts {
  db: Db;
  clientFactory?: (apiKey: string) => ExplainClient;
}

export async function aiRoutes(app: FastifyInstance, opts: Opts) {
  const { db, clientFactory = (apiKey: string) => new Anthropic({ apiKey }) } = opts;

  app.post<{ Body: { text: string; context?: string[] } }>('/api/explain', async (req, reply) => {
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: 'text required' });

    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const cached = db.prepare('SELECT response_json FROM explain_cache WHERE sentence_hash=?').get(hash) as any;
    if (cached) return { cached: true, explanation: JSON.parse(cached.response_json) };

    const apiKey = getSetting(db, 'anthropic_api_key');
    if (!apiKey) return reply.code(503).send({ code: 'AI_NOT_CONFIGURED', error: 'Anthropic API key not set (settings page)' });

    const model = getSetting(db, 'ai_model') ?? 'claude-opus-4-8';
    try {
      const explanation = await explainSentence(clientFactory(apiKey), model, {
        text, context: req.body.context ?? [],
      });
      db.prepare('INSERT INTO explain_cache (sentence_hash, sentence_text, response_json) VALUES (?,?,?)')
        .run(hash, text, JSON.stringify(explanation));
      return { cached: false, explanation };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(502).send({ code: 'AI_ERROR', error: String(err?.message ?? err) });
    }
  });
}
```

- [ ] **Step 5: 在 index.ts 注册** — `await app.register(aiRoutes, { db });`

- [ ] **Step 6: 运行测试确认通过** — Run: `npm test -w server`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(server): claude api sentence explanation with sqlite cache"
```

---

## Task 13: progress 与 settings 路由

**Files:**
- Create: `server/src/modules/misc/routes.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/misc-routes.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/misc-routes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createDb } from '../src/db.js';
import { miscRoutes } from '../src/modules/misc/routes.js';

function makeApp(db = createDb(':memory:')) {
  const app = Fastify();
  app.register(miscRoutes, { db });
  return { app, db };
}

describe('progress', () => {
  it('upserts and is visible via /api/media... (direct table check)', async () => {
    const { app, db } = makeApp();
    const id = db.prepare(`INSERT INTO media (series, file_path) VALUES ('A','/a')`).run().lastInsertRowid;
    await app.inject({ method: 'PUT', url: `/api/media/${id}/progress`, payload: { positionSec: 12.5 } });
    await app.inject({ method: 'PUT', url: `/api/media/${id}/progress`, payload: { positionSec: 99 } });
    const row: any = db.prepare('SELECT position_sec FROM progress WHERE media_id=?').get(id);
    expect(row.position_sec).toBe(99);
  });
});

describe('settings', () => {
  it('PUT then GET, api key masked in GET', async () => {
    const { app } = makeApp();
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { anthropic_api_key: 'sk-ant-xyz', ai_model: 'claude-opus-4-8' } });
    const res = await app.inject({ url: '/api/settings' });
    const body = res.json();
    expect(body.ai_model).toBe('claude-opus-4-8');
    expect(body.anthropic_api_key_set).toBe(true);
    expect(body.anthropic_api_key).toBeUndefined(); // 不回传明文
  });
});
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w server`

- [ ] **Step 3: 实现 misc/routes.ts**

```ts
import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting, type Db } from '../../db.js';

export async function miscRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.put<{ Params: { id: string }; Body: { positionSec: number } }>(
    '/api/media/:id/progress',
    async (req) => {
      db.prepare(`
        INSERT INTO progress (media_id, position_sec, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(media_id) DO UPDATE SET position_sec=excluded.position_sec, updated_at=excluded.updated_at
      `).run(req.params.id, req.body.positionSec);
      return { ok: true };
    },
  );

  app.get('/api/settings', async () => ({
    ai_model: getSetting(db, 'ai_model') ?? 'claude-opus-4-8',
    anthropic_api_key_set: getSetting(db, 'anthropic_api_key') != null,
  }));

  app.put<{ Body: Record<string, string> }>('/api/settings', async (req) => {
    for (const key of ['anthropic_api_key', 'ai_model'] as const) {
      const v = req.body?.[key];
      if (typeof v === 'string' && v !== '') setSetting(db, key, v);
    }
    return { ok: true };
  });
}
```

- [ ] **Step 4: 在 index.ts 注册** — `await app.register(miscRoutes, { db });`

- [ ] **Step 5: 运行测试确认通过** — Run: `npm test -w server`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(server): progress and settings routes"
```

---

## Task 14: Web 脚手架 + API client + 媒体库页

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/vitest.config.ts`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/types.ts`, `web/src/pages/LibraryPage.tsx`, `web/src/index.css`

- [ ] **Step 1: 创建 Vite 应用与依赖**

```bash
npm install -w web react react-dom react-router-dom
npm install -w web -D typescript vite @vitejs/plugin-react vitest @types/react @types/react-dom
```

`web/package.json`:
```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "test": "vitest run" }
}
```

`web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
```

`web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`web/index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>アニメ学習プレイヤー</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: types.ts 与 api.ts**

`web/src/types.ts`:
```ts
export interface MediaItem {
  id: number;
  series: string;
  episode: number | null;
  codecStatus: string;
  playable: boolean;
  hasSubtitle: boolean;
  positionSec: number;
}
export interface Cue { start: number; end: number; text: string }
export interface SubtitleData { offsetMs: number; cues: Cue[] }
export interface Gloss { word: string; kana: string; gloss: string }
export interface Token {
  surface: string; base: string; reading: string; pos: string; posDetail: string; glosses: Gloss[];
}
export interface Explanation {
  translation: string; structure: string;
  expressions: { expression: string; meaning: string }[];
  nuance: string;
}
```

`web/src/api.ts`:
```ts
import type { MediaItem, SubtitleData, Token, Explanation } from './types';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: await res.json().catch(() => null) });
  return res.json();
}

export const api = {
  listMedia: () => fetch('/api/media').then((r) => j<MediaItem[]>(r)),
  scan: () => fetch('/api/media/scan', { method: 'POST' }).then((r) => j<{ ok: true }>(r)),
  subtitles: (id: number) => fetch(`/api/media/${id}/subtitles`).then((r) => j<SubtitleData>(r)),
  setOffset: (id: number, offsetMs: number) =>
    fetch(`/api/media/${id}/subtitle-offset`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offsetMs }) }).then((r) => j(r)),
  analyze: (text: string) =>
    fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).then((r) => j<{ tokens: Token[] }>(r)),
  explain: (text: string, context: string[]) =>
    fetch('/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, context }) }).then((r) => j<{ cached: boolean; explanation: Explanation }>(r)),
  saveProgress: (id: number, positionSec: number) =>
    fetch(`/api/media/${id}/progress`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ positionSec }) }),
  getSettings: () => fetch('/api/settings').then((r) => j<{ ai_model: string; anthropic_api_key_set: boolean }>(r)),
  saveSettings: (s: Record<string, string>) =>
    fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }).then((r) => j(r)),
};
```

- [ ] **Step 3: App 路由与媒体库页**

`web/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

`web/src/App.tsx`:
```tsx
import { Routes, Route, Link } from 'react-router-dom';
import LibraryPage from './pages/LibraryPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <div className="app">
      <nav className="topnav">
        <Link to="/">ライブラリ</Link>
        <Link to="/settings">設定</Link>
      </nav>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/play/:id" element={<PlayerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
```

（`PlayerPage`/`SettingsPage` 先建占位文件 `export default function PlayerPage() { return null; }`，Task 16/18 实现。）

`web/src/pages/LibraryPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { MediaItem } from '../types';

export default function LibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [scanning, setScanning] = useState(false);

  const refresh = () => api.listMedia().then(setItems).catch(console.error);
  useEffect(() => { refresh(); }, []);

  const scan = async () => {
    setScanning(true);
    try { await api.scan(); await refresh(); } finally { setScanning(false); }
  };

  return (
    <main className="library">
      <header>
        <h1>ライブラリ</h1>
        <button onClick={scan} disabled={scanning}>{scanning ? 'スキャン中…' : 'フォルダをスキャン'}</button>
      </header>
      {items.length === 0 && <p>動画がありません。~/AnimeLibrary に mkv/mp4 と字幕を置いてスキャンしてください。</p>}
      <ul className="media-list">
        {items.map((m) => (
          <li key={m.id}>
            {m.playable ? (
              <Link to={`/play/${m.id}`}>
                {m.series} {m.episode != null && `- 第${m.episode}話`}
              </Link>
            ) : (
              <span title="このコーデックはブラウザ再生不可。別ソースを推奨">
                {m.series} {m.episode != null && `- 第${m.episode}話`}（要トランスコード）
              </span>
            )}
            {!m.hasSubtitle && <em> 字幕なし</em>}
            {m.positionSec > 30 && <em> 続き {Math.floor(m.positionSec / 60)}:{String(Math.floor(m.positionSec % 60)).padStart(2, '0')}</em>}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

`web/src/index.css`（最小样式，后续任务追加播放页样式）:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Hiragino Sans", sans-serif; background: #16161a; color: #eee; }
a { color: #7cc0ff; }
.topnav { display: flex; gap: 16px; padding: 10px 16px; border-bottom: 1px solid #333; }
.library { padding: 16px; max-width: 720px; }
.media-list { list-style: none; padding: 0; }
.media-list li { padding: 8px 0; border-bottom: 1px solid #2a2a2e; }
.media-list em { color: #999; margin-left: 8px; font-style: normal; font-size: 0.85em; }
button { background: #2a2a35; color: #eee; border: 1px solid #444; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: 0.5; }
```

- [ ] **Step 4: 手动验证**

Run: `npm run dev -w server`（后台）+ `npm run dev -w web`，浏览器开 http://localhost:5173
Expected: 媒体库页渲染；放一个 mkv 到 `~/AnimeLibrary` 后点扫描出现条目（remux 需几秒）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): vite scaffold, api client, library page"
```

---

## Task 15: 学习模式状态机（纯 reducer，TDD）

**Files:**
- Create: `web/src/player/learningMode.ts`
- Test: `web/test/learningMode.test.ts`

设计：reducer 返回新状态 + 副作用列表（由 hook 执行到 `<video>` 上），保证纯函数可测。

- [ ] **Step 1: 写失败测试**

`web/test/learningMode.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { initialState, reduce, currentCueIndex, type LearnState } from '../src/player/learningMode';
import type { Cue } from '../src/types';

const cues: Cue[] = [
  { start: 1, end: 3, text: '一句目' },
  { start: 5, end: 8, text: '二句目' },
];

describe('currentCueIndex', () => {
  it('finds active cue, or the previous one during gaps', () => {
    expect(currentCueIndex(cues, 2)).toBe(0);      // 句中
    expect(currentCueIndex(cues, 4)).toBe(0);      // 间隙 → 归属上一句
    expect(currentCueIndex(cues, 6)).toBe(1);
    expect(currentCueIndex(cues, 0.5)).toBe(-1);   // 第一句之前
  });
});

describe('reduce', () => {
  it('TOGGLE_PAUSE while playing: pauses and reveals', () => {
    const { state, effects } = reduce(initialState, { type: 'TOGGLE_PAUSE' });
    expect(state.paused).toBe(true);
    expect(state.revealed).toBe(true);
    expect(effects).toEqual([{ type: 'pause' }]);
  });

  it('TOGGLE_PAUSE while paused: resumes and hides subtitle', () => {
    const paused: LearnState = { ...initialState, paused: true, revealed: true };
    const { state, effects } = reduce(paused, { type: 'TOGGLE_PAUSE' });
    expect(state.paused).toBe(false);
    expect(state.revealed).toBe(false);
    expect(effects).toEqual([{ type: 'play' }]);
  });

  it('REPLAY seeks to cue start and plays without revealing', () => {
    const paused: LearnState = { ...initialState, paused: true, revealed: true };
    const { state, effects } = reduce(paused, { type: 'REPLAY', cueStart: 5 });
    expect(state.revealed).toBe(false);
    expect(state.paused).toBe(false);
    expect(effects).toEqual([{ type: 'seek', time: 5 }, { type: 'play' }]);
  });

  it('REPLAY with no cue does nothing', () => {
    const { state, effects } = reduce(initialState, { type: 'REPLAY', cueStart: null });
    expect(effects).toEqual([]);
    expect(state).toEqual(initialState);
  });

  it('PREV/NEXT seek to given cue start, keep hidden', () => {
    const { effects } = reduce(initialState, { type: 'JUMP', cueStart: 1 });
    expect(effects).toEqual([{ type: 'seek', time: 1 }]);
  });

  it('TOGGLE_ALWAYS_ON flips subtitle-always-visible mode', () => {
    const { state } = reduce(initialState, { type: 'TOGGLE_ALWAYS_ON' });
    expect(state.alwaysOn).toBe(true);
    const back = reduce(state, { type: 'TOGGLE_ALWAYS_ON' });
    expect(back.state.alwaysOn).toBe(false);
  });

  it('subtitle visible iff alwaysOn or revealed', () => {
    expect(initialState.alwaysOn || initialState.revealed).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败** — Run: `npm test -w web`

- [ ] **Step 3: 实现 learningMode.ts**

```ts
import type { Cue } from '../types';

export interface LearnState {
  paused: boolean;
  revealed: boolean;  // 暂停时显示当前句
  alwaysOn: boolean;  // 普通观影模式：字幕常显
}

export const initialState: LearnState = { paused: false, revealed: false, alwaysOn: false };

export type LearnAction =
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'REPLAY'; cueStart: number | null }
  | { type: 'JUMP'; cueStart: number | null }
  | { type: 'TOGGLE_ALWAYS_ON' }
  | { type: 'EXTERNAL_PLAY' }    // 用户点了原生控制条
  | { type: 'EXTERNAL_PAUSE' };

export type Effect = { type: 'pause' } | { type: 'play' } | { type: 'seek'; time: number };

export function reduce(state: LearnState, action: LearnAction): { state: LearnState; effects: Effect[] } {
  switch (action.type) {
    case 'TOGGLE_PAUSE':
      return state.paused
        ? { state: { ...state, paused: false, revealed: false }, effects: [{ type: 'play' }] }
        : { state: { ...state, paused: true, revealed: true }, effects: [{ type: 'pause' }] };
    case 'REPLAY':
      if (action.cueStart == null) return { state, effects: [] };
      return {
        state: { ...state, paused: false, revealed: false },
        effects: [{ type: 'seek', time: action.cueStart }, { type: 'play' }],
      };
    case 'JUMP':
      if (action.cueStart == null) return { state, effects: [] };
      return { state, effects: [{ type: 'seek', time: action.cueStart }] };
    case 'TOGGLE_ALWAYS_ON':
      return { state: { ...state, alwaysOn: !state.alwaysOn }, effects: [] };
    case 'EXTERNAL_PLAY':
      return { state: { ...state, paused: false, revealed: false }, effects: [] };
    case 'EXTERNAL_PAUSE':
      return { state: { ...state, paused: true, revealed: true }, effects: [] };
  }
}

/** 当前时间对应的句子下标：句内返回该句；间隙返回上一句；第一句前返回 -1 */
export function currentCueIndex(cues: Cue[], time: number): number {
  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].start <= time) idx = i;
    else break;
  }
  return idx;
}
```

- [ ] **Step 4: 运行测试确认通过** — Run: `npm test -w web`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): learning mode reducer with cue lookup"
```

---

## Task 16: 播放页（视频 + 字幕覆盖层 + 快捷键）

**Files:**
- Create: `web/src/player/SubtitleOverlay.tsx`
- Modify: `web/src/pages/PlayerPage.tsx`, `web/src/index.css`

- [ ] **Step 1: SubtitleOverlay**

`web/src/player/SubtitleOverlay.tsx`:
```tsx
export default function SubtitleOverlay({ text, visible }: { text: string | null; visible: boolean }) {
  if (!visible || !text) return null;
  return <div className="subtitle-overlay">{text}</div>;
}
```

- [ ] **Step 2: PlayerPage 主体**

`web/src/pages/PlayerPage.tsx`:
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import type { SubtitleData } from '../types';
import { initialState, reduce, currentCueIndex, type LearnState, type LearnAction, type Effect } from '../player/learningMode';
import SubtitleOverlay from '../player/SubtitleOverlay';
import AnalysisPanel from '../player/AnalysisPanel';

export default function PlayerPage() {
  const { id } = useParams();
  const mediaId = Number(id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [subs, setSubs] = useState<SubtitleData | null>(null);
  const [subError, setSubError] = useState(false);
  const [learn, setLearn] = useState<LearnState>(initialState);
  const [time, setTime] = useState(0);

  useEffect(() => {
    api.subtitles(mediaId).then(setSubs).catch(() => setSubError(true));
  }, [mediaId]);

  const cues = subs?.cues ?? [];
  const cueIdx = useMemo(() => currentCueIndex(cues, time), [cues, time]);
  const cue = cueIdx >= 0 ? cues[cueIdx] : null;

  const runEffects = useCallback((effects: Effect[]) => {
    const v = videoRef.current;
    if (!v) return;
    for (const e of effects) {
      if (e.type === 'pause') v.pause();
      else if (e.type === 'play') v.play();
      else if (e.type === 'seek') { v.currentTime = e.time + 0.01; setTime(e.time + 0.01); }
    }
  }, []);

  const dispatch = useCallback((action: LearnAction) => {
    setLearn((s) => {
      const { state, effects } = reduce(s, action);
      runEffects(effects);
      return state;
    });
  }, [runEffects]);

  // 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      switch (e.code) {
        case 'Space': e.preventDefault(); dispatch({ type: 'TOGGLE_PAUSE' }); break;
        case 'KeyA': dispatch({ type: 'REPLAY', cueStart: cue?.start ?? null }); break;
        case 'ArrowLeft': e.preventDefault(); dispatch({ type: 'JUMP', cueStart: cueIdx > 0 ? cues[cueIdx - 1].start : null }); break;
        case 'ArrowRight': e.preventDefault(); dispatch({ type: 'JUMP', cueStart: cueIdx < cues.length - 1 ? cues[cueIdx + 1].start : null }); break;
        case 'KeyS': dispatch({ type: 'TOGGLE_ALWAYS_ON' }); break;
        case 'BracketLeft': adjustOffset(-100); break;
        case 'BracketRight': adjustOffset(+100); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function adjustOffset(deltaMs: number) {
    if (!subs) return;
    const next = subs.offsetMs + deltaMs;
    await api.setOffset(mediaId, next);
    const fresh = await api.subtitles(mediaId);
    setSubs(fresh);
  }

  // 进度保存（每 5 秒）
  useEffect(() => {
    const t = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) api.saveProgress(mediaId, v.currentTime);
    }, 5000);
    return () => clearInterval(t);
  }, [mediaId]);

  const subtitleVisible = learn.alwaysOn || learn.revealed;

  return (
    <main className="player-page">
      <div className="player-main">
        <div className="video-wrap">
          <video
            ref={videoRef}
            src={`/api/media/${mediaId}/stream`}
            controls
            autoPlay
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => dispatch({ type: 'EXTERNAL_PLAY' })}
            onPause={() => dispatch({ type: 'EXTERNAL_PAUSE' })}
          />
          <SubtitleOverlay text={cue?.text ?? null} visible={subtitleVisible} />
        </div>
        <div className="hotkeys">
          <span><b>Space</b> 暂停+显示字幕</span>
          <span><b>A</b> 回到本句重听</span>
          <span><b>←/→</b> 上一句/下一句</span>
          <span><b>S</b> 字幕常显 {learn.alwaysOn ? 'ON' : 'OFF'}</span>
          <span><b>[ ]</b> 字幕偏移 {subs ? `${subs.offsetMs}ms` : ''}</span>
          <Link to="/">← ライブラリ</Link>
        </div>
        {subError && <p className="warn">この動画に字幕がありません。学習モードは使えません。</p>}
      </div>
      <AnalysisPanel
        sentence={learn.paused && cue ? cue.text : null}
        context={cueIdx >= 0 ? cues.slice(Math.max(0, cueIdx - 2), cueIdx + 3).map((c) => c.text) : []}
      />
    </main>
  );
}
```

（`AnalysisPanel` 在 Task 17 实现，此处先建接受 `{sentence, context}` 并返回 null 的占位，保证编译通过。）

- [ ] **Step 3: 播放页样式（追加到 index.css）**

```css
.player-page { display: grid; grid-template-columns: 1fr 380px; gap: 12px; padding: 12px; height: calc(100vh - 45px); }
.player-main { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.video-wrap { position: relative; background: #000; }
.video-wrap video { width: 100%; max-height: 70vh; display: block; }
.subtitle-overlay {
  position: absolute; bottom: 56px; left: 0; right: 0; text-align: center;
  font-size: 26px; color: #fff; text-shadow: 0 0 6px #000, 0 0 2px #000; padding: 0 24px; pointer-events: none;
}
.hotkeys { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: #aaa; align-items: center; }
.hotkeys b { color: #eee; }
.warn { color: #f0a; }
.analysis-panel { background: #1e1e24; border: 1px solid #333; border-radius: 8px; padding: 14px; overflow-y: auto; }
.analysis-panel h2 { font-size: 15px; margin: 0 0 8px; color: #aaa; }
.sentence { font-size: 18px; line-height: 1.8; margin-bottom: 12px; }
.token-chip { display: inline-block; border: 1px solid #444; border-radius: 4px; padding: 1px 6px; margin: 2px; cursor: pointer; font-size: 14px; }
.token-chip.active { background: #2a4a6a; border-color: #7cc0ff; }
.gloss-box { border-top: 1px solid #333; padding-top: 8px; margin-top: 8px; font-size: 14px; }
.gloss-box .reading { color: #999; margin-left: 6px; }
.explain-box { border-top: 1px solid #333; margin-top: 12px; padding-top: 10px; font-size: 14px; line-height: 1.7; }
.explain-box dt { color: #7cc0ff; margin-top: 8px; }
```

- [ ] **Step 4: 手动验证**

前后端都起，打开某集 → 默认无字幕播放；Space 暂停出字幕；A 回句首；←/→ 跳句；S 常显；[ ] 调偏移。
Expected: 全部行为正确，Console 无报错。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): player page with hidden-subtitle learning mode and hotkeys"
```

---

## Task 17: 右侧分析面板（分词 + 查词 + AI 讲解）

**Files:**
- Create: `web/src/player/AnalysisPanel.tsx`（替换占位）

- [ ] **Step 1: 实现 AnalysisPanel**

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Token, Explanation } from '../types';

interface Props {
  sentence: string | null;   // 暂停时的当前句；null = 播放中
  context: string[];
}

export default function AnalysisPanel({ sentence, context }: Props) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explainState, setExplainState] = useState<'idle' | 'loading' | 'error' | 'unconfigured'>('idle');

  useEffect(() => {
    setTokens([]); setActive(null); setExplanation(null); setExplainState('idle');
    if (!sentence) return;
    api.analyze(sentence).then((r) => setTokens(r.tokens)).catch(console.error);
  }, [sentence]);

  // D 键触发深度讲解
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'KeyD' && sentence) requestExplain(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function requestExplain() {
    if (!sentence || explainState === 'loading' || explanation) return;
    setExplainState('loading');
    try {
      const r = await api.explain(sentence, context);
      setExplanation(r.explanation);
      setExplainState('idle');
    } catch (err: any) {
      setExplainState(err?.status === 503 ? 'unconfigured' : 'error');
    }
  }

  if (!sentence) {
    return (
      <aside className="analysis-panel">
        <h2>解析パネル</h2>
        <p style={{ color: '#777' }}>Space で一時停止すると、現在のセリフを解析します。</p>
      </aside>
    );
  }

  const activeToken = active != null ? tokens[active] : null;

  return (
    <aside className="analysis-panel">
      <h2>現在のセリフ</h2>
      <div className="sentence">{sentence}</div>

      <div>
        {tokens.map((t, i) =>
          t.pos === '記号' ? (
            <span key={i}>{t.surface}</span>
          ) : (
            <span
              key={i}
              className={`token-chip${active === i ? ' active' : ''}`}
              onClick={() => setActive(active === i ? null : i)}
            >
              {t.surface}
            </span>
          ),
        )}
      </div>

      {activeToken && (
        <div className="gloss-box">
          <div>
            <b>{activeToken.base}</b>
            <span className="reading">{activeToken.reading}</span>
            <span className="reading">［{activeToken.pos}{activeToken.posDetail && `・${activeToken.posDetail}`}］</span>
          </div>
          {activeToken.surface !== activeToken.base && <div className="reading">活用形: {activeToken.surface} → {activeToken.base}</div>}
          {activeToken.glosses.length > 0
            ? activeToken.glosses.map((g, i) => <div key={i}>{g.gloss}</div>)
            : <div className="reading">辞書に見つかりません</div>}
        </div>
      )}

      <div className="explain-box">
        {explanation ? (
          <dl>
            <dt>翻訳</dt><dd>{explanation.translation}</dd>
            <dt>文法構造</dt><dd>{explanation.structure}</dd>
            <dt>表現</dt>
            {explanation.expressions.map((e, i) => <dd key={i}><b>{e.expression}</b> — {e.meaning}</dd>)}
            <dt>ニュアンス</dt><dd>{explanation.nuance}</dd>
          </dl>
        ) : explainState === 'loading' ? (
          <p>AI 解説を生成中…</p>
        ) : explainState === 'unconfigured' ? (
          <p>API キー未設定。設定ページで Anthropic API キーを入れてください。</p>
        ) : explainState === 'error' ? (
          <p>AI 解説に失敗しました。<button onClick={requestExplain}>再試行</button></p>
        ) : (
          <button onClick={requestExplain}>AI 深度講解（D）</button>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: 手动验证**

暂停后：面板出现分词 chip，点 chip 出词典释义（需先跑过 `npm run import-jmdict -w server`，未导入时显示「辞書に見つかりません」但不报错）；按 D 或点按钮，未配 key 时出提示；配 key 后出四段讲解；同一句第二次瞬间返回（缓存）。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(web): analysis panel with tokens, glosses, and ai explanation"
```

---

## Task 18: 设置页

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`（替换占位）

- [ ] **Step 1: 实现**

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api';

export default function SettingsPage() {
  const [keySet, setKeySet] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-opus-4-8');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => { setKeySet(s.anthropic_api_key_set); setModel(s.ai_model); });
  }, []);

  async function save() {
    const payload: Record<string, string> = { ai_model: model };
    if (apiKey) payload.anthropic_api_key = apiKey;
    await api.saveSettings(payload);
    setSaved(true); setApiKey(''); setKeySet(keySet || apiKey !== '');
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="library">
      <h1>設定</h1>
      <p>
        <label>Anthropic API キー {keySet && '（設定済み）'}<br />
          <input type="password" value={apiKey} placeholder={keySet ? '変更する場合のみ入力' : 'sk-ant-...'} onChange={(e) => setApiKey(e.target.value)} style={{ width: 360 }} />
        </label>
      </p>
      <p>
        <label>AI モデル<br />
          <input value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 360 }} />
        </label>
      </p>
      <button onClick={save}>保存</button> {saved && '保存しました'}
      <hr />
      <p style={{ color: '#888', fontSize: 13 }}>
        メディアフォルダ: ~/AnimeLibrary（環境変数 MEDIA_DIR で変更可）<br />
        辞書データ: server/vendor/jmdict-eng.json を置いて npm run import-jmdict -w server
      </p>
    </main>
  );
}
```

- [ ] **Step 2: 手动验证** — 保存 key → 刷新显示「設定済み」；GET /api/settings 不含明文。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(web): settings page for api key and model"
```

---

## Task 19: 端到端冒烟 + README + 收尾

**Files:**
- Create: `README.md`
- Test: 全量回归

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: server + web 所有测试通过。

- [ ] **Step 2: 端到端冒烟（真实素材）**

1. `~/AnimeLibrary` 放一个真实 mkv + 对应 `.ja.srt`（jimaku.cc 手动下载）
2. `npm start`，浏览器 5173：扫描 → 出现条目 → 进播放页
3. 学习模式全流程：无字幕播放 → Space 暂停出字幕+分词 → 点词出释义 → D 出 AI 讲解 → Space 继续（字幕隐藏）→ A 重听 → [ ] 微调偏移
4. 刷新页面 → 媒体库显示「続き」

- [ ] **Step 3: README.md**

```markdown
# アニメ学習プレイヤー

看番学日语的本地播放器：默认隐藏字幕，暂停显示当前句并做分词/查词/AI 语法讲解。

## 准备
1. Node 22+，ffmpeg（`brew install ffmpeg`）
2. `npm install`
3. 词典（可选但推荐）：从 https://github.com/scriptin/jmdict-simplified/releases
   下载 jmdict-eng-*.json.zip，解压为 `server/vendor/jmdict-eng.json`，
   然后 `npm run import-jmdict -w server`
4. 视频与字幕放入 `~/AnimeLibrary`（mkv/mp4 + 同名 .srt/.ass，`Show - 01.ja.srt` 形式也可）

## 启动
`npm start` → http://localhost:5173

## 快捷键（播放页）
| 键 | 功能 |
|----|------|
| Space | 暂停并显示当前句 / 继续（重新隐藏）|
| A | 回到本句开头重听（不显示字幕）|
| ← / → | 上一句 / 下一句 |
| D | 当前句 AI 深度讲解（需在设置页配 Anthropic API key）|
| S | 字幕常显开关（普通看番模式）|
| [ / ] | 字幕偏移 ±100ms |

## 第二版计划
jimaku.cc 字幕自动匹配 → nyaa 搜索下载 → 生词本/Anki 导出。
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: readme with setup and hotkeys"
```

---

## Self-Review 记录

- **Spec coverage:** 设计文档第 3 节工作流 → Task 15/16；第 4 节各模块 → Task 3–13；错误处理表 → 404/503/降级分别在 Task 7/8/12/17；测试策略 → 各任务 TDD + Task 19 冒烟。转码兜底按 spec 为"仅提示"（LibraryPage 显示要トランスコード）。
- **占位扫描:** 无 TBD；AnalysisPanel/PlayerPage/SettingsPage 占位文件均在后续任务被完整实现替换。
- **类型一致性:** `Cue{start,end,text}`、`Token{surface,base,reading,pos,posDetail,glosses}`、`Explanation{translation,structure,expressions,nuance}` 在 server 路由、web/types.ts、组件间一致；API 路径前后端一致（api.ts 为唯一前端出口）。
```
