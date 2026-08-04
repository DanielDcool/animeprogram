import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_WIDTH,
  normalizeStoredPlayerWidth,
  playerWidthFromPointer,
  resizePlayerWidthByKey,
} from '../src/player/playerLayout';

describe('player layout sizing', () => {
  it('converts a pointer position to a percentage of the player page', () => {
    expect(playerWidthFromPointer(700, 100, 1000)).toBe(60);
  });

  it('keeps enough room for both the video and analysis panel', () => {
    expect(playerWidthFromPointer(150, 100, 1000)).toBe(40);
    expect(playerWidthFromPointer(1000, 100, 1000)).toBe(66.8);
  });

  it('supports keyboard resizing and ignores unrelated keys', () => {
    expect(resizePlayerWidthByKey(DEFAULT_PLAYER_WIDTH, 'ArrowLeft', 1200)).toBe(60);
    expect(resizePlayerWidthByKey(DEFAULT_PLAYER_WIDTH, 'ArrowRight', 1200)).toBe(64);
    expect(resizePlayerWidthByKey(DEFAULT_PLAYER_WIDTH, 'Enter', 1200)).toBeNull();
  });

  it('restores a finite saved width and rejects invalid storage', () => {
    expect(normalizeStoredPlayerWidth('74')).toBe(74);
    expect(normalizeStoredPlayerWidth('NaN')).toBe(DEFAULT_PLAYER_WIDTH);
    expect(normalizeStoredPlayerWidth(null)).toBe(DEFAULT_PLAYER_WIDTH);
  });
});
