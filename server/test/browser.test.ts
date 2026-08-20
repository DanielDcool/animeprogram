import { describe, expect, it } from 'vitest';
import { browserOpenCommand, resolveWebUrl, waitForHttpOk } from '../../scripts/browser.mjs';

describe('resolveWebUrl', () => {
  it('defaults to the Vite port 5173', () => {
    expect(resolveWebUrl({})).toBe('http://localhost:5173/');
  });

  it('honours WEB_PORT', () => {
    expect(resolveWebUrl({ WEB_PORT: '4321' })).toBe('http://localhost:4321/');
  });

  it('ignores an invalid WEB_PORT', () => {
    expect(resolveWebUrl({ WEB_PORT: 'abc' })).toBe('http://localhost:5173/');
  });
});

describe('browserOpenCommand', () => {
  const url = 'http://localhost:5173/';

  it('uses open on macOS', () => {
    expect(browserOpenCommand('darwin', url)).toEqual({ command: 'open', args: [url] });
  });

  it('uses cmd start with an empty title on Windows', () => {
    expect(browserOpenCommand('win32', url)).toEqual({ command: 'cmd', args: ['/c', 'start', '', url] });
  });

  it('uses xdg-open elsewhere', () => {
    expect(browserOpenCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] });
  });
});

describe('waitForHttpOk', () => {
  it('resolves true once fetch answers, retrying connection errors', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) throw new Error('ECONNREFUSED');
      return { status: 200 } as Response;
    };
    await expect(
      waitForHttpOk('http://127.0.0.1:1/', { timeoutMs: 1000, intervalMs: 1, fetchImpl }),
    ).resolves.toBe(true);
    expect(calls).toBe(3);
  });

  it('treats any HTTP response as ready, even a 404', async () => {
    const fetchImpl = async () => ({ status: 404 }) as Response;
    await expect(
      waitForHttpOk('http://127.0.0.1:1/', { timeoutMs: 1000, intervalMs: 1, fetchImpl }),
    ).resolves.toBe(true);
  });

  it('with requireOk, keeps polling through proxy errors until a 200 arrives', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      // Vite は起動済みだが後端がまだのとき、プロキシは 500 を返す
      return { status: calls < 3 ? 500 : 200 } as Response;
    };
    await expect(
      waitForHttpOk('http://127.0.0.1:1/api/health', { timeoutMs: 1000, intervalMs: 1, fetchImpl, requireOk: true }),
    ).resolves.toBe(true);
    expect(calls).toBe(3);
  });

  it('with requireOk, resolves false when only errors arrive before the timeout', async () => {
    const fetchImpl = async () => ({ status: 500 }) as Response;
    await expect(
      waitForHttpOk('http://127.0.0.1:1/api/health', { timeoutMs: 20, intervalMs: 5, fetchImpl, requireOk: true }),
    ).resolves.toBe(false);
  });

  it('resolves false when the timeout elapses', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(
      waitForHttpOk('http://127.0.0.1:1/', { timeoutMs: 20, intervalMs: 5, fetchImpl }),
    ).resolves.toBe(false);
  });
});
