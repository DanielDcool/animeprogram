import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { DRAMA_PICKS } from '../src/modules/drama/editorial.js';
import { dramaRoutes } from '../src/modules/drama/routes.js';
import {
  DramaUpstreamError,
  type CatalogDrama,
  type DramaCatalogClient,
} from '../src/modules/drama/client.js';
import type { ResourceProvider, ResourceSearchOptions } from '../src/modules/resource/provider.js';

function drama(id: number): CatalogDrama {
  return {
    id,
    title: 'タイトル',
    titleEnglish: null,
    titleNative: 'タイトル',
    coverImage: null,
    bannerImage: null,
    description: 'あらすじ',
    score: 78,
    episodes: 10,
    status: 'FINISHED',
    startDate: '2026-07-04',
    network: 'TBS',
    links: [],
  };
}

function fakeResources(record: { options?: ResourceSearchOptions } = {}): ResourceProvider {
  return {
    async search(queries, _category, options = {}) {
      record.options = options;
      return { items: [], query: queries[0] ?? '' };
    },
  };
}

async function buildTestApp(client: DramaCatalogClient | null, resources = fakeResources()) {
  const app = Fastify();
  await app.register(dramaRoutes, { getClient: () => client, resources });
  return app;
}

describe('drama routes without a tmdb token', () => {
  it('serves the hand-written picks instead of failing', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({ method: 'GET', url: '/api/drama/home' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tmdbConfigured).toBe(false);
    expect(body.featured).toHaveLength(DRAMA_PICKS.length);
    expect(body.current.items).toEqual([]);
  });

  it('explains that search needs a token', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({ method: 'GET', url: '/api/drama/search?q=silent' });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('TMDB_NOT_CONFIGURED');
  });

  it('still resolves a pick detail from the local list', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({ method: 'GET', url: `/api/drama/${DRAMA_PICKS[0].tmdbId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: DRAMA_PICKS[0].tmdbId,
      title: DRAMA_PICKS[0].title,
    });
  });

  it('404s an unknown drama when nothing local matches', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({ method: 'GET', url: '/api/drama/99999999' });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('DRAMA_NOT_FOUND');
  });
});

describe('drama routes with a tmdb token', () => {
  const client: DramaCatalogClient = {
    home: async () => ({
      current: { year: 2026, season: 'SUMMER', items: [drama(11)] },
      previous: { year: 2026, season: 'SPRING', items: [drama(21)] },
      featured: [],
      tmdbConfigured: true,
    }),
    search: async () => [drama(31)],
    detail: async (id) => (id === 11 ? drama(11) : null),
  };

  it('merges live seasons with the local picks', async () => {
    const app = await buildTestApp(client);

    const body = (await app.inject({ method: 'GET', url: '/api/drama/home' })).json();

    expect(body.tmdbConfigured).toBe(true);
    expect(body.current.items).toHaveLength(1);
    expect(body.featured).toHaveLength(DRAMA_PICKS.length);
  });

  it('rejects a too-short query', async () => {
    const app = await buildTestApp(client);

    const response = await app.inject({ method: 'GET', url: '/api/drama/search?q=s' });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_QUERY');
  });

  it('maps upstream failures to 502', async () => {
    const app = await buildTestApp({
      ...client,
      search: async () => { throw new DramaUpstreamError('TMDB returned 500'); },
    });

    const response = await app.inject({ method: 'GET', url: '/api/drama/search?q=silent' });

    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('DRAMA_UNAVAILABLE');
  });
});

describe('drama resource search', () => {
  it('searches the live action category with the drama kind', async () => {
    const record: { options?: ResourceSearchOptions } = {};
    const app = await buildTestApp(null, fakeResources(record));

    const response = await app.inject({
      method: 'GET',
      url: `/api/drama/${DRAMA_PICKS[0].tmdbId}/resources`,
    });

    expect(response.statusCode).toBe(200);
    expect(record.options?.kind).toBe('drama');
    // ドラマの既定は raw（日本のテレビ録画が主流で、英語字幕は学習に不要）
    expect(response.json().category).toBe('raw');
    expect(response.json().externalSearchUrl).toContain('c=4_4');
  });

  it('rejects an unknown category', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({
      method: 'GET',
      url: `/api/drama/${DRAMA_PICKS[0].tmdbId}/resources?category=bogus`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_RESOURCE_CATEGORY');
  });
});
