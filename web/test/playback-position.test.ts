import { describe, expect, it } from 'vitest';
import { playbackStartPosition, playbackUrl } from '../src/player/playbackPosition.js';

describe('playbackUrl', () => {
  it('includes the saved sentence time in a vocabulary source link', () => {
    expect(playbackUrl(7, 17.5432)).toBe('/play/7?t=17.543');
  });

  it('keeps a plain media link when no time was saved', () => {
    expect(playbackUrl(7, null)).toBe('/play/7');
  });
});

describe('playbackStartPosition', () => {
  it('prefers a valid linked sentence time over saved viewing progress', () => {
    expect(playbackStartPosition('?t=17.5', 301)).toBe(17.5);
  });

  it('uses saved viewing progress when there is no linked time', () => {
    expect(playbackStartPosition('', 301)).toBe(301);
  });

  it('ignores invalid or negative linked times', () => {
    expect(playbackStartPosition('?t=bad', 42)).toBe(42);
    expect(playbackStartPosition('?t=-5', 42)).toBe(42);
  });
});
