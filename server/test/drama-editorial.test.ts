import { describe, expect, it } from 'vitest';
import {
  DRAMA_PICKS,
  dramaEditorialNote,
  dramaFeatured,
} from '../src/modules/drama/editorial.js';

describe('drama editorial picks', () => {
  it('ships a usable hand-written list', () => {
    expect(DRAMA_PICKS.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every pick a real tmdb id, a badge and a reason', () => {
    for (const pick of DRAMA_PICKS) {
      expect(Number.isSafeInteger(pick.tmdbId) && pick.tmdbId > 0).toBe(true);
      expect(pick.title.length).toBeGreaterThan(0);
      expect(pick.badge.length).toBeGreaterThan(0);
      expect(pick.reason.length).toBeGreaterThan(0);
    }
  });

  it('only hot-links posters, never bundles image files', () => {
    for (const pick of DRAMA_PICKS) {
      if (pick.posterUrl == null) continue;
      expect(pick.posterUrl.startsWith('https://image.tmdb.org/t/p/')).toBe(true);
    }
  });

  it('has no duplicate ids', () => {
    const ids = DRAMA_PICKS.map((pick) => pick.tmdbId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes picks as catalog-shaped entries usable without a tmdb token', () => {
    const featured = dramaFeatured();
    expect(featured).toHaveLength(DRAMA_PICKS.length);
    expect(featured[0]).toMatchObject({
      id: DRAMA_PICKS[0].tmdbId,
      title: DRAMA_PICKS[0].title,
      coverImage: DRAMA_PICKS[0].posterUrl,
    });
    expect(featured[0].recommendation?.reason).toBe(DRAMA_PICKS[0].reason);
  });

  it('looks up a note by tmdb id', () => {
    expect(dramaEditorialNote(DRAMA_PICKS[0].tmdbId)?.badge).toBe(DRAMA_PICKS[0].badge);
    expect(dramaEditorialNote(-1)).toBeUndefined();
  });
});

describe('drama picks searchability', () => {
  it('carries the romaji spelling into the catalog shape, since Nyaa live action indexes romaji far better than the japanese title', () => {
    const withRomaji = DRAMA_PICKS.filter((pick) => pick.titleRomaji != null);
    // 8 本中 silent 以外はローマ字表記が原題と異なる
    expect(withRomaji.length).toBeGreaterThanOrEqual(DRAMA_PICKS.length - 1);

    const featured = dramaFeatured();
    for (const pick of DRAMA_PICKS) {
      const entry = featured.find((item) => item.id === pick.tmdbId);
      expect(entry?.titleEnglish).toBe(pick.titleRomaji);
      // 検索語は原題とローマ字の 2 系統になる
      expect(entry?.titleNative).toBe(pick.title);
    }
  });
});
