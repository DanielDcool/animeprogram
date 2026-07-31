import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogAnime, CatalogClient } from '../src/modules/catalog/client.js';
import {
  ResourceUpstreamError,
  type ResourceProvider,
  type ResourceResult,
} from '../src/modules/resource/provider.js';
import { resourceRoutes } from '../src/modules/resource/routes.js';

const anime: CatalogAnime = {
  id: 1,
  title: 'テストアニメ',
  titleRomaji: 'Test Anime',
  titleEnglish: 'Test Anime',
  titleNative: 'テストアニメ',
  coverImage: null,
  bannerImage: null,
  description: '',
  genres: [],
  score: 80,
  popularity: 100,
  episodes: 12,
  status: 'FINISHED',
  format: 'TV',
  startDate: '2026-01-01',
  studio: null,
  links: [],
};

const resource: ResourceResult = {
  id: '0123456789abcdef0123456789abcdef01234567',
  title: '[SubsPlease] Test Anime - 01 (1080p)',
  detailUrl: 'https://nyaa.si/view/123',
  magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
  size: '1 GiB',
  sizeBytes: 1_073_741_824,
  seeders: 10,
  leechers: 1,
  downloads: 20,
  publishedAt: '2026-01-01T00:00:00.000Z',
  trusted: true,
  remake: false,
  category: 'Anime - English-translated',
  releaseGroup: 'SubsPlease',
  resolution: '1080p',
  codec: 'H.264',
  needsTranscode: false,
};

function fakeCatalog(detail = vi.fn().mockResolvedValue(anime)): CatalogClient {
  return {
    home: vi.fn(),
    search: vi.fn(),
    detail,
  };
}

function fakeResources(search = vi.fn().mockResolvedValue({ items: [resource], query: 'Test Anime' })):
ResourceProvider {
  return { search };
}

function makeApp(catalog: CatalogClient, resources: ResourceProvider) {
  const app = Fastify();
  app.register(resourceRoutes, { catalog, resources });
  return app;
}

describe('resource routes', () => {
  it('searches English-subtitled resources with unique anime titles by default', async () => {
    const resources = fakeResources();
    const response = await makeApp(fakeCatalog(), resources).inject(
      '/api/catalog/anime/1/resources',
    );

    expect(response.statusCode).toBe(200);
    expect(resources.search).toHaveBeenCalledWith(
      ['テストアニメ S01', 'Test Anime S01', 'テストアニメ', 'Test Anime'],
      'english',
      { season: 1 },
    );
    expect(response.json()).toMatchObject({
      items: [{ id: resource.id }],
      query: 'Test Anime',
      category: 'english',
    });
    const fallback = new URL(response.json().externalSearchUrl);
    expect(fallback.origin).toBe('https://nyaa.si');
    expect(fallback.searchParams.get('c')).toBe('1_2');
    expect(fallback.searchParams.get('q')).toBe('Test Anime');
  });

  it('passes raw and all category choices to the provider', async () => {
    const resources = fakeResources();
    const app = makeApp(fakeCatalog(), resources);

    expect((await app.inject('/api/catalog/anime/1/resources?category=raw')).statusCode).toBe(200);
    expect((await app.inject('/api/catalog/anime/1/resources?category=all')).statusCode).toBe(200);
    expect(resources.search).toHaveBeenNthCalledWith(
      1,
      ['テストアニメ S01', 'Test Anime S01', 'テストアニメ', 'Test Anime'],
      'raw',
      { season: 1 },
    );
    expect(resources.search).toHaveBeenNthCalledWith(
      2,
      ['テストアニメ S01', 'Test Anime S01', 'テストアニメ', 'Test Anime'],
      'all',
      { season: 1 },
    );
  });

  it('passes an explicit sequel number to the resource provider', async () => {
    const resources = fakeResources();
    const sequel = {
      ...anime,
      title: 'テストアニメⅡ',
      titleNative: 'テストアニメⅡ',
      titleRomaji: 'Test Anime II',
      titleEnglish: 'Test Anime Season 2',
    };

    const response = await makeApp(fakeCatalog(vi.fn().mockResolvedValue(sequel)), resources)
      .inject('/api/catalog/anime/1/resources');

    expect(response.statusCode).toBe(200);
    expect(resources.search).toHaveBeenCalledWith(
      [
        'テストアニメⅡ S02',
        'Test Anime II S02',
        'Test Anime Season 2 S02',
        'テストアニメⅡ',
        'Test Anime II',
        'Test Anime Season 2',
      ],
      'english',
      { season: 2 },
    );
  });

  it('rejects invalid ids and categories without calling dependencies', async () => {
    const catalog = fakeCatalog();
    const resources = fakeResources();
    const app = makeApp(catalog, resources);

    const invalidId = await app.inject('/api/catalog/anime/nope/resources');
    const invalidCategory = await app.inject('/api/catalog/anime/1/resources?category=games');

    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.json().code).toBe('INVALID_ANIME_ID');
    expect(invalidCategory.statusCode).toBe(400);
    expect(invalidCategory.json().code).toBe('INVALID_RESOURCE_CATEGORY');
    expect(catalog.detail).not.toHaveBeenCalled();
    expect(resources.search).not.toHaveBeenCalled();
  });

  it('returns 404 when the catalog anime does not exist', async () => {
    const response = await makeApp(
      fakeCatalog(vi.fn().mockResolvedValue(null)),
      fakeResources(),
    ).inject('/api/catalog/anime/404/resources');

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ANIME_NOT_FOUND');
  });

  it('maps resource upstream failures to a stable 502 response', async () => {
    const resources = fakeResources(vi.fn().mockRejectedValue(new ResourceUpstreamError()));
    const response = await makeApp(fakeCatalog(), resources)
      .inject('/api/catalog/anime/1/resources');

    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('RESOURCE_UNAVAILABLE');
    expect(response.json().externalSearchUrl).toContain('https://nyaa.si/');
  });
});
