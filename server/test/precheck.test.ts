import { describe, expect, it } from 'vitest';
import { checkNodeVersion, runPrecheck } from '../../scripts/precheck.mjs';

const anyTool = () => true;

describe('checkNodeVersion', () => {
  it('accepts Node 22', () => {
    expect(checkNodeVersion('v22.12.0')).toEqual({ ok: true, major: 22 });
  });

  it('rejects other major versions', () => {
    expect(checkNodeVersion('v24.1.0').ok).toBe(false);
    expect(checkNodeVersion('v23.0.0').ok).toBe(false);
    expect(checkNodeVersion('v20.19.0').ok).toBe(false);
  });
});

describe('runPrecheck', () => {
  it('passes with Node 22 and both FFmpeg tools present', () => {
    const result = runPrecheck({
      nodeVersion: 'v22.12.0',
      platform: 'darwin',
      checkCommand: anyTool,
      env: {},
    });
    expect(result).toEqual({ skipped: false, failures: [], warnings: [] });
  });

  it('fails hard on a wrong Node major version with install guidance', () => {
    const result = runPrecheck({
      nodeVersion: 'v24.1.0',
      platform: 'darwin',
      checkCommand: anyTool,
      env: {},
    });
    expect(result.failures).toHaveLength(1);
    const message = result.failures[0];
    expect(message).toContain('Node.js 22');
    expect(message).toContain('v24.1.0');
    expect(message).toContain('better-sqlite3');
    expect(message).toContain('.node-version');
    expect(result.warnings).toEqual([]);
  });

  it('warns but does not fail when FFmpeg tools are missing', () => {
    const result = runPrecheck({
      nodeVersion: 'v22.12.0',
      platform: 'darwin',
      checkCommand: () => false,
      env: {},
    });
    expect(result.failures).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('ffmpeg');
    expect(result.warnings[0]).toContain('ffprobe');
  });

  it('only lists the tools that are actually missing', () => {
    const result = runPrecheck({
      nodeVersion: 'v22.12.0',
      platform: 'darwin',
      checkCommand: (command: string) => command === 'ffmpeg',
      env: {},
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('ffprobe');
    expect(result.warnings[0]).not.toContain('ffmpeg -version');
  });

  it('gives platform-specific FFmpeg install hints', () => {
    const onMac = runPrecheck({
      nodeVersion: 'v22.12.0',
      platform: 'darwin',
      checkCommand: () => false,
      env: {},
    });
    expect(onMac.warnings[0]).toContain('brew install ffmpeg');

    const onWindows = runPrecheck({
      nodeVersion: 'v22.12.0',
      platform: 'win32',
      checkCommand: () => false,
      env: {},
    });
    expect(onWindows.warnings[0]).toContain('ffmpeg.org');

    const onLinux = runPrecheck({
      nodeVersion: 'v22.12.0',
      platform: 'linux',
      checkCommand: () => false,
      env: {},
    });
    expect(onLinux.warnings[0]).toContain('package manager');
  });

  it('skips every check when TANKU_SKIP_PRECHECK=1', () => {
    let calls = 0;
    const result = runPrecheck({
      nodeVersion: 'v24.1.0',
      platform: 'darwin',
      checkCommand: () => {
        calls += 1;
        return false;
      },
      env: { TANKU_SKIP_PRECHECK: '1' },
    });
    expect(result).toEqual({ skipped: true, failures: [], warnings: [] });
    expect(calls).toBe(0);
  });
});
