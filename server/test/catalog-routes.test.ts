import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import {
  CatalogUpstreamError,
  type CatalogAnime,
  type CatalogClient,
} from '../src/modules/catalog/client.js';
import { catalogRoutes } from '../src/modules/catalog/routes.js';

const anime: CatalogAnime = {
  id: 1,
  title: 'テストアニメ',
  titleRomaji: 'Test Anime',
  titleEnglish: 'Test Anime',
  titleNative: 'テストアニメ',
  coverImage: null,
  bannerImage: null,
  description: '説明',
  genres: ['Drama'],
  score: 80,
  popularity: 100,
  episodes: 12,
  status: 'RELEASING',
  format: 'TV',
  startDate: '2026-07-01',
  studio: 'Studio Test',
  links: [],
};

function fakeClient(overrides: Partial<CatalogClient> = {}): CatalogClient {
  return {
    home: vi.fn().mockResolvedValue({
      current: { year: 2026, season: 'SUMMER', items: [anime] },
      previous: { year: 2026, season: 'SPRING', items: [] },
      featured: [anime],
    }),
    search: vi.fn().mockResolvedValue([anime]),
    detail: vi.fn().mockResolvedValue(anime),
    ...overrides,
  };
}

function makeApp(client: CatalogClient) {
  const app = Fastify();
  app.register(catalogRoutes, { client });
  return app;
}

describe('catalog routes', () => {
  it('returns home, search and detail results', async () => {
    const client = fakeClient();
    const app = makeApp(client);

    const home = await app.inject('/api/catalog/home');
    const search = await app.inject('/api/catalog/search?q=Frieren');
    const detail = await app.inject('/api/catalog/anime/1');

    expect(home.statusCode).toBe(200);
    expect(home.json().current.season).toBe('SUMMER');
    expect(search.statusCode).toBe(200);
    expect(search.json().items[0].id).toBe(1);
    expect(client.search).toHaveBeenCalledWith('Frieren');
    expect(detail.statusCode).toBe(200);
    expect(detail.json().id).toBe(1);
  });

  it('rejects search terms shorter than two characters', async () => {
    const client = fakeClient();
    const response = await makeApp(client).inject('/api/catalog/search?q=a');

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_QUERY');
    expect(client.search).not.toHaveBeenCalled();
  });

  it('returns 404 when an anime does not exist', async () => {
    const response = await makeApp(fakeClient({ detail: vi.fn().mockResolvedValue(null) }))
      .inject('/api/catalog/anime/404');

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ANIME_NOT_FOUND');
  });

  it('maps AniList failures to a stable 502 response', async () => {
    const response = await makeApp(fakeClient({
      home: vi.fn().mockRejectedValue(new CatalogUpstreamError()),
    })).inject('/api/catalog/home');

    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('CATALOG_UNAVAILABLE');
  });
});
