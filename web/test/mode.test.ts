import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTENT_MODE,
  MODE_STORAGE_KEY,
  effectiveMode,
  normalizeStoredMode,
} from '../src/mode';

describe('normalizeStoredMode', () => {
  it('accepts the two known modes', () => {
    expect(normalizeStoredMode('anime')).toBe('anime');
    expect(normalizeStoredMode('drama')).toBe('drama');
  });

  it('falls back to anime for missing or unknown values', () => {
    expect(normalizeStoredMode(null)).toBe(DEFAULT_CONTENT_MODE);
    expect(normalizeStoredMode('')).toBe('anime');
    expect(normalizeStoredMode('movie')).toBe('anime');
  });
});

describe('effectiveMode', () => {
  it('keeps the chosen mode on browsing routes', () => {
    expect(effectiveMode('drama', '/')).toBe('drama');
    expect(effectiveMode('drama', '/library')).toBe('drama');
    expect(effectiveMode('drama', '/drama/12345')).toBe('drama');
    expect(effectiveMode('anime', '/anime/999')).toBe('anime');
  });

  it('forces the player route to the ink theme in both modes', () => {
    expect(effectiveMode('drama', '/play/7')).toBe('anime');
    expect(effectiveMode('anime', '/play/7')).toBe('anime');
  });

  it('does not force look-alike paths', () => {
    expect(effectiveMode('drama', '/players')).toBe('drama');
    expect(effectiveMode('drama', '/play')).toBe('drama');
  });

  it('exposes a stable storage key', () => {
    expect(MODE_STORAGE_KEY).toBe('tanku.contentMode');
  });
});
