import { describe, expect, it, vi } from 'vitest';
import {
  createTmdbDramaCatalog,
  seasonDateRange,
  type TmdbFetch,
} from '../src/modules/drama/client.js';

function tvItem(id: number) {
  return {
    id,
    name: '日本語タイトル',
    original_name: '日本語原題',
    overview: '日本語のあらすじ。',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    vote_average: 7.8,
    first_air_date: '2026-07-04',
    genre_ids: [18],
  };
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('seasonDateRange', () => {
  it('maps each cour to its calendar quarter', () => {
    expect(seasonDateRange({ year: 2026, season: 'SUMMER' }))
      .toEqual({ gte: '2026-07-01', lte: '2026-09-30' });
    expect(seasonDateRange({ year: 2026, season: 'WINTER' }))
      .toEqual({ gte: '2026-01-01', lte: '2026-03-31' });
    expect(seasonDateRange({ year: 2025, season: 'FALL' }))
      .toEqual({ gte: '2025-10-01', lte: '2025-12-31' });
  });
});

describe('createTmdbDramaCatalog', () => {
  it('sends the bearer token and never puts it in the url', async () => {
    const fetchImpl = vi.fn<TmdbFetch>(async (url, init) => {
      expect(String(url)).not.toContain('secret-token');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
      return jsonResponse({ results: [tvItem(1)] });
    });
    const catalog = createTmdbDramaCatalog('secret-token', fetchImpl);

    await catalog.search('silent');

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('normalizes results and caches repeated home requests', async () => {
    const fetchImpl = vi.fn<TmdbFetch>(async (url) => {
      const items = String(url).includes('2026-07-01') ? [tvItem(11), tvItem(12)] : [tvItem(21)];
      return jsonResponse({ results: items });
    });
    const catalog = createTmdbDramaCatalog(
      'token',
      fetchImpl,
      () => new Date('2026-08-14T12:00:00+09:00'),
    );

    const first = await catalog.home();
    const second = await catalog.home();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
    expect(first.current).toMatchObject({ year: 2026, season: 'SUMMER' });
    expect(first.current.items[0]).toMatchObject({
      id: 11,
      title: '日本語原題',
      titleEnglish: '日本語タイトル',
      coverImage: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      bannerImage: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      score: 78,
      startDate: '2026-07-04',
      status: 'UNKNOWN',
    });
  });

  it('maps tmdb status words onto the anilist vocabulary and keeps https links only', async () => {
    const fetchImpl = vi.fn<TmdbFetch>(async () => jsonResponse({
      ...tvItem(99),
      status: 'Returning Series',
      number_of_episodes: 10,
      homepage: 'https://drama.example/official',
      networks: [{ name: 'TBS' }],
      'watch/providers': {
        results: { JP: { link: 'https://www.themoviedb.org/tv/99/watch?locale=JP' } },
      },
    }));
    const catalog = createTmdbDramaCatalog('token', fetchImpl);

    const detail = await catalog.detail(99);

    expect(detail).toMatchObject({ status: 'RELEASING', episodes: 10, network: 'TBS' });
    expect(detail?.links).toEqual([
      { site: '配信を探す（TMDB）', url: 'https://www.themoviedb.org/tv/99/watch?locale=JP', type: 'STREAMING' },
      { site: '公式サイト', url: 'https://drama.example/official', type: 'INFO' },
    ]);
  });

  it('returns null for a missing drama and raises upstream errors', async () => {
    const missing = vi.fn<TmdbFetch>(async () => new Response('{}', { status: 404 }));
    await expect(createTmdbDramaCatalog('token', missing).detail(1)).resolves.toBeNull();

    const broken = vi.fn<TmdbFetch>(async () => new Response('{}', { status: 500 }));
    await expect(createTmdbDramaCatalog('token', broken).search('x')).rejects.toThrow('TMDB returned 500');
  });
});
