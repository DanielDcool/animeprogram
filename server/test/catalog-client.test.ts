import { describe, expect, it, vi } from 'vitest';
import {
  createAniListCatalog,
  getSeasonPair,
  type AniListFetch,
} from '../src/modules/catalog/client.js';

function media(id: number) {
  return {
    id,
    title: { native: '日本語タイトル', romaji: 'Romaji Title', english: 'English Title' },
    coverImage: { extraLarge: 'https://img.example/cover.jpg' },
    bannerImage: 'https://img.example/banner.jpg',
    description: '<b>一行目</b><br>二行目 &amp; 続き',
    genres: ['Slice of Life'],
    averageScore: 82,
    popularity: 12000,
    episodes: 12,
    status: 'RELEASING',
    format: 'TV',
    startDate: { year: 2026, month: 7, day: 4 },
    studios: { nodes: [{ name: 'Studio Test' }] },
    externalLinks: [
      { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/test', type: 'STREAMING' },
      { site: 'Official Site', url: 'https://anime.example/test', type: 'INFO' },
      { site: 'Trailer', url: 'https://youtube.com/watch?v=test', type: 'SOCIAL' },
      { site: 'Unsafe', url: 'http://unsafe.example/test', type: 'STREAMING' },
    ],
  };
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('getSeasonPair', () => {
  it('returns summer and spring in July', () => {
    expect(getSeasonPair(new Date('2026-07-22T12:00:00+09:00'))).toEqual({
      current: { year: 2026, season: 'SUMMER' },
      previous: { year: 2026, season: 'SPRING' },
    });
  });

  it('rolls the previous season into the prior year', () => {
    expect(getSeasonPair(new Date('2026-01-15T12:00:00+09:00'))).toEqual({
      current: { year: 2026, season: 'WINTER' },
      previous: { year: 2025, season: 'FALL' },
    });
  });
});

describe('createAniListCatalog', () => {
  it('normalizes home results, merges editorial notes and caches successful requests', async () => {
    const fetchImpl = vi.fn<AniListFetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const items = body.variables.season === 'SUMMER'
        ? [media(178789), media(196187), media(177699)]
        : [media(147105)];
      return jsonResponse({ Page: { media: items } });
    });
    const catalog = createAniListCatalog(fetchImpl, () => new Date('2026-07-22T12:00:00+09:00'));

    const first = await catalog.home();
    const second = await catalog.home();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
    expect(first.current).toMatchObject({ year: 2026, season: 'SUMMER' });
    expect(first.current.items[0]).toMatchObject({
      id: 178789,
      title: '日本語タイトル',
      description: '一行目\n二行目 & 続き',
      startDate: '2026-07-04',
      studio: 'Studio Test',
    });
    expect(first.current.items[0].links).toEqual([
      { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/test', type: 'STREAMING' },
      { site: 'Official Site', url: 'https://anime.example/test', type: 'INFO' },
    ]);
    expect(first.featured.map((item) => item.id)).toEqual([196187, 177699, 178789]);
    expect(first.featured[0].recommendation?.reason).toContain('日常会話');
  });

  it('searches titles and returns normalized non-adult results', async () => {
    const fetchImpl = vi.fn<AniListFetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.variables).toMatchObject({ search: 'Frieren', perPage: 20 });
      return jsonResponse({ Page: { media: [media(154587)] } });
    });
    const catalog = createAniListCatalog(fetchImpl);

    const results = await catalog.search('Frieren');

    expect(results).toHaveLength(1);
    expect(results[0].titleRomaji).toBe('Romaji Title');
  });

  it('returns null when an anime detail is absent', async () => {
    const fetchImpl = vi.fn<AniListFetch>(async () => jsonResponse({ Media: null }));
    const catalog = createAniListCatalog(fetchImpl);

    await expect(catalog.detail(999999)).resolves.toBeNull();
  });
});
