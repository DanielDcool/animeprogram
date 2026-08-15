import { describe, expect, it } from 'vitest';
import {
  compatibilityMessage,
  resourceErrorHint,
  resourceMetaLabels,
  resourceStateCopy,
} from '../src/catalog/resourceView';

const baseResource = {
  releaseGroup: 'SubsPlease',
  resolution: '1080p' as const,
  codec: 'H.264' as const,
  size: '1.25 GiB',
  seeders: 20,
  needsTranscode: false,
  publishedAt: '2026-07-21T12:00:00.000Z',
};

describe('resource result view helpers', () => {
  it('formats group, playback metadata, size and seed count as stable labels', () => {
    expect(resourceMetaLabels(baseResource)).toEqual([
      'SubsPlease', '1080p', 'H.264', '1.25 GiB', 'シード 20', '2026-07-21',
    ]);
  });

  it('warns about conversion only for resources marked as needing it', () => {
    expect(compatibilityMessage(baseResource)).toBeNull();
    expect(compatibilityMessage({ ...baseResource, needsTranscode: true }))
      .toBe('ブラウザ再生には変換が必要な場合があります。');
  });

  it('uses different copy for idle, loading, empty and upstream error states', () => {
    expect(resourceStateCopy('idle')).toContain('検索');
    expect(resourceStateCopy('loading')).toContain('取得');
    expect(resourceStateCopy('empty')).toContain('見つかりません');
    expect(resourceStateCopy('error')).toContain('取得できません');
  });

  it('tells proxied users that the server, not the browser, must reach nyaa.si', () => {
    // ブラウザで nyaa.si が開けても、サーバー側の fetch はシステムプロキシを使わない
    expect(resourceStateCopy('error')).toContain('サーバー');
    expect(resourceStateCopy('error')).toContain('nyaa.si');

    const hint = resourceErrorHint('fetch failed (ENOTFOUND)');
    expect(hint).toContain('NODE_USE_ENV_PROXY=1');
    expect(hint).toContain('HTTPS_PROXY');
    expect(hint).toContain('fetch failed (ENOTFOUND)');
    expect(resourceErrorHint(undefined)).toContain('NODE_USE_ENV_PROXY=1');
    expect(resourceErrorHint(undefined)).not.toContain('undefined');
  });
});
