import { describe, expect, it } from 'vitest';
import { resolveMediaDir } from '../src/config.js';

describe('resolveMediaDir', () => {
  it('uses the default directory when no override was saved', () => {
    expect(resolveMediaDir('/home/user/AnimeLibrary')).toBe('/home/user/AnimeLibrary');
  });

  it('uses the directory saved in settings', () => {
    expect(resolveMediaDir('/home/user/AnimeLibrary', '/media/anime')).toBe('/media/anime');
  });

  it('keeps MEDIA_DIR as the highest-priority override', () => {
    expect(resolveMediaDir('/home/user/AnimeLibrary', '/media/anime', '/env/anime')).toBe('/env/anime');
  });
});
