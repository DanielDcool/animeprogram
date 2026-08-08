import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));
process.on('message', (message) => {
  if (message && typeof message === 'object' && message.type === 'shutdown') stopChildren(0);
});
