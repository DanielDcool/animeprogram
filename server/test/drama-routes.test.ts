import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { DRAMA_PICKS, dramaHero } from '../src/modules/drama/editorial.js';
import { dramaRoutes } from '../src/modules/drama/routes.js';
import {
  ResourceUpstreamError,
  type ResourceProvider,
  type ResourceSearchOptions,
} from '../src/modules/resource/provider.js';

interface Call { queries: string[]; category: string; options: ResourceSearchOptions }

function recordingProvider(calls: Call[], items = 0): ResourceProvider {
  return {
    async search(queries, category, options = {}) {
      calls.push({ queries, category, options });
      return {
        items: Array.from({ length: items }, (_, i) => ({ id: `hash${i}` })) as never,
        query: queries[0] ?? '',
      };
    },
  };
}

function failingProvider(): ResourceProvider {
  return {
    async search() { throw new ResourceUpstreamError('Nyaa returned 503'); },
  };
}

async function buildTestApp(resources: ResourceProvider) {
  const app = Fastify();
  await app.register(dramaRoutes, { resources });
  return app;
}

describe('drama catalog is the bundled list', () => {
  it('serves the hero and every pick with no external dependency', async () => {
    const app = await buildTestApp(recordingProvider([]));

    const body = (await app.inject({ method: 'GET', url: '/api/drama/home' })).json();

    expect(body.hero.id).toBe(dramaHero().id);
    expect(body.picks.map((p: { id: number }) => p.id)).toEqual(DRAMA_PICKS.map((p) => p.tmdbId));
    expect(body.picks[0].recommendation.reason.length).toBeGreaterThan(0);
    expect(body.picks[0].level).toBe(DRAMA_PICKS[0].level);
  });

  it('resolves a pick detail, and the hero too', async () => {
    const app = await buildTestApp(recordingProvider([]));

    for (const id of [DRAMA_PICKS[0].tmdbId, dramaHero().id]) {
      const res = await app.inject({ method: 'GET', url: `/api/drama/${id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(id);
    }
  });

  it('404s anything outside the bundled list', async () => {
    const app = await buildTestApp(recordingProvider([]));

    const res = await app.inject({ method: 'GET', url: '/api/drama/99999999' });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('DRAMA_NOT_FOUND');
  });

  it('rejects a malformed id', async () => {
    const app = await buildTestApp(recordingProvider([]));

    const res = await app.inject({ method: 'GET', url: '/api/drama/abc' });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_DRAMA_ID');
  });
});

describe('keyword search goes straight to nyaa', () => {
  it('searches all live-action subcategories and uses the typed words verbatim', async () => {
    const calls: Call[] = [];
    const app = await buildTestApp(recordingProvider(calls, 3));

    const res = await app.inject({ method: 'GET', url: '/api/drama/search?q=%E3%81%82%E3%81%AE%E5%86%AC' });

    expect(res.statusCode).toBe(200);
    // 作品名を推測して書き換えない: 入力そのまま 1 本
    expect(calls[0].queries).toEqual(['あの冬']);
    expect(calls[0].options.kind).toBe('drama');
    // 通しのパックは多言語字幕付きが多く、raw だけに絞ると漏れる
    expect(res.json().category).toBe('all');
    expect(res.json().externalSearchUrl).toContain('c=4_0');
  });

  it('honours an explicit category', async () => {
    const calls: Call[] = [];
    const app = await buildTestApp(recordingProvider(calls, 1));

    const res = await app.inject({ method: 'GET', url: '/api/drama/search?q=silent&category=english' });

    expect(res.json().category).toBe('english');
    // 実写の英語字幕は 4_1（アニメの 1_2 相当）。1→4 の置換だと 4_2 になり誤爆する
    expect(res.json().externalSearchUrl).toContain('c=4_1');
  });

  it('rejects a too-short query before touching the network', async () => {
    const calls: Call[] = [];
    const app = await buildTestApp(recordingProvider(calls));

    const res = await app.inject({ method: 'GET', url: '/api/drama/search?q=a' });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_QUERY');
    expect(calls).toHaveLength(0);
  });

  it('rejects an unknown category', async () => {
    const app = await buildTestApp(recordingProvider([]));

    const res = await app.inject({ method: 'GET', url: '/api/drama/search?q=silent&category=bogus' });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_RESOURCE_CATEGORY');
  });

  it('falls back to a nyaa site link when nyaa is down', async () => {
    const app = await buildTestApp(failingProvider());

    const res = await app.inject({ method: 'GET', url: '/api/drama/search?q=silent' });

    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('RESOURCE_UNAVAILABLE');
    expect(res.json().externalSearchUrl).toContain('nyaa.si');
    expect(res.json().reason).toBe('Nyaa returned 503');
  });
});

describe('per-title resource search', () => {
  it('searches both the japanese title and the romaji spelling', async () => {
    const calls: Call[] = [];
    const app = await buildTestApp(recordingProvider(calls, 2));
    const pick = DRAMA_PICKS.find((p) => p.titleRomaji && p.titleRomaji !== p.title)!;

    const res = await app.inject({ method: 'GET', url: `/api/drama/${pick.tmdbId}/resources` });

    expect(res.statusCode).toBe(200);
    expect(calls[0].queries.join(' ')).toContain(pick.title);
    expect(calls[0].queries.join(' ')).toContain(pick.titleRomaji!);
    expect(calls[0].options.kind).toBe('drama');
  });

  it('404s a work outside the bundled list', async () => {
    const app = await buildTestApp(recordingProvider([]));

    const res = await app.inject({ method: 'GET', url: '/api/drama/99999999/resources' });

    expect(res.statusCode).toBe(404);
  });
});

describe('japanese input falls back to a romaji spelling', () => {
  it('tries the typed japanese first, then the romaji reading', async () => {
    const calls: Call[] = [];
    const app = Fastify();
    await app.register(dramaRoutes, {
      resources: recordingProvider(calls, 1),
      toRomaji: async () => 'Kinou Nani Tabeta',
    });

    await app.inject({ method: 'GET', url: '/api/drama/search?q=%E3%81%8D%E3%81%AE%E3%81%86%E4%BD%95%E9%A3%9F%E3%81%B9%E3%81%9F' });

    // provider は先に当たった方を返すので、順序が意味を持つ
    expect(calls[0].queries).toEqual(['きのう何食べた', 'Kinou Nani Tabeta']);
  });

  it('does not transliterate a latin query', async () => {
    const calls: Call[] = [];
    const app = Fastify();
    await app.register(dramaRoutes, {
      resources: recordingProvider(calls, 1),
      toRomaji: async () => 'should not be used',
    });

    await app.inject({ method: 'GET', url: '/api/drama/search?q=MIU404' });

    expect(calls[0].queries).toEqual(['MIU404']);
  });

  it('still searches when the transliterator throws', async () => {
    const calls: Call[] = [];
    const app = Fastify();
    await app.register(dramaRoutes, {
      resources: recordingProvider(calls, 1),
      toRomaji: async () => { throw new Error('dictionary missing'); },
    });

    const res = await app.inject({ method: 'GET', url: '/api/drama/search?q=%E5%AD%A4%E7%8B%AC' });

    expect(res.statusCode).toBe(200);
    expect(calls[0].queries).toEqual(['孤独']);
  });
});
