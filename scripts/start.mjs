import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserOpenCommand, resolveWebUrl, waitForHttpOk } from './browser.mjs';
import { defaultCheckCommand, runPrecheck } from './precheck.mjs';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const precheck = runPrecheck({
  nodeVersion: process.version,
  platform: process.platform,
  checkCommand: defaultCheckCommand,
  env: process.env,
});
for (const warning of precheck.warnings) {
  console.warn(`\n[tanku Anime] WARNING\n${warning}\n`);
}
if (precheck.failures.length > 0) {
  for (const failure of precheck.failures) {
    console.error(`\n[tanku Anime] STARTUP CHECK FAILED\n${failure}\n`);
  }
  console.error('[tanku Anime] Set TANKU_SKIP_PRECHECK=1 to bypass these checks at your own risk.');
  process.exit(1);
}

function resolvePackageBin(workspace, packageName) {
  const require = createRequire(path.join(rootDir, workspace, 'package.json'));
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const relativeBin = typeof packageJson.bin === 'string'
    ? packageJson.bin
    : packageJson.bin?.[packageName];
  if (!relativeBin) throw new Error(`${packageName} does not expose a CLI`);
  return path.resolve(path.dirname(packageJsonPath), relativeBin);
}

const services = [
  {
    name: 'server',
    cwd: path.join(rootDir, 'server'),
    cli: resolvePackageBin('server', 'tsx'),
    args: ['src/index.ts'],
  },
  {
    name: 'web',
    cwd: path.join(rootDir, 'web'),
    cli: resolvePackageBin('web', 'vite'),
    args: [],
  },
];

const children = services.map((service) => ({
  ...service,
  child: spawn(process.execPath, [service.cli, ...service.args], {
    cwd: service.cwd,
    env: process.env,
    stdio: 'inherit',
  }),
}));

let stopping = false;
let exitCode = 0;
let running = children.length;

function stopChildren(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const { child } of children) {
    if (child.exitCode == null && child.signalCode == null) child.kill('SIGTERM');
  }
}

for (const { name, child } of children) {
  child.on('error', (error) => {
    console.error(`[tanku Anime] Could not start ${name}: ${error.message}`);
    stopChildren(1);
  });
  child.on('exit', (code, signal) => {
    running -= 1;
    if (!stopping) {
      const failed = code !== 0 || signal != null;
      console.error(`[tanku Anime] ${name} stopped${code == null ? '' : ` with code ${code}`}.`);
      stopChildren(failed ? (code ?? 1) : 0);
    }
    if (running === 0) process.exitCode = exitCode;
  });
}

// ダブルクリック起動用: TANKU_OPEN_BROWSER=1 のときだけ、準備ができたらブラウザを開く。
// Vite のプロキシ越しに /api/health の 200 を待つ——web だけ先に起動した状態で開くと、
// 設定ページなどが最初の API 呼び出しに失敗したまま止まるため（server は web より起動が遅い）。
// 通常の `npm start` / verify:start / CI では何もしない。
if (process.env.TANKU_OPEN_BROWSER === '1') {
  const url = resolveWebUrl(process.env);
  waitForHttpOk(`${url}api/health`, { timeoutMs: 60_000, intervalMs: 500, fetchImpl: fetch, requireOk: true }).then((ready) => {
    if (stopping) return;
    if (!ready) {
      console.warn(`[tanku Anime] The web page did not answer within 60s. Open ${url} manually once it starts.`);
      return;
    }
    const { command, args } = browserOpenCommand(process.platform, url);
    const opener = spawn(command, args, { detached: true, stdio: 'ignore' });
    opener.on('error', (error) => {
      console.warn(`[tanku Anime] Could not open the browser (${error.message}). Open ${url} manually.`);
    });
    opener.unref();
  });
}

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));
process.on('message', (message) => {
  if (message && typeof message === 'object' && message.type === 'shutdown') stopChildren(0);
});
