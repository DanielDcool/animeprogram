import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_AGENT,
  DramaUpstreamError,
  createBangumiCatalog,
  type BangumiFetch,
} from '../src/modules/drama/bangumi.js';
import { DRAMA_PICKS } from '../src/modules/drama/editorial.js';

interface Recorded { url: string; init?: RequestInit }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, calls: Recorded[] = []): BangumiFetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return handler(url, init);
  };
}

const UNNATURAL = {
  id: 225581,
  type: 6,
  name: 'アンナチュラル',
  name_cn: '非自然死亡',
  date: '2018-01-12',
  platform: '日剧',
  nsfw: false,
  eps: 10,
  summary: '海外とは異なり、\r\n日本では…',
  images: { large: 'https://lain.bgm.tv/pic/cover/l/0a/3f/225581_ifE52.jpg' },
  rating: { score: 8.4, total: 3111 },
  infobox: [
    { key: '别名', value: [{ v: 'UNNATURAL' }, { v: '非自然死亡' }] },
    { key: '电视台', value: 'TBSテレビ' },
  ],
};

const MOVIE = { ...UNNATURAL, id: 451141, name: '白い巨塔', platform: '电影', eps: 1 };
const NSFW = { ...UNNATURAL, id: 1, name: '成人向け', nsfw: true };
const UNRATED = { ...UNNATURAL, id: 228021, name: '白い刑事', rating: { score: 0, total: 0 }, eps: 0, summary: '', infobox: [] };

describe('bangumi search', () => {
  it('posts the keyword with the real-life filter and an identifying user agent', async () => {
    const calls: Recorded[] = [];
    const catalog = createBangumiCatalog(fakeFetch(() => jsonResponse({ total: 0, data: [] }), calls));

    await catalog.search('白い');

    expect(calls[0].url).toBe('https://api.bgm.tv/v0/search/subjects?limit=20');
    expect(calls[0].init?.method).toBe('POST');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['user-agent']).toBe(DEFAULT_USER_AGENT);
    expect(DEFAULT_USER_AGENT).toMatch(/^tanku-anime\/\d/);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ keyword: '白い', filter: { type: [6] } });
  });

  it('keeps only japanese tv dramas and normalizes the shape', async () => {
    const catalog = createBangumiCatalog(fakeFetch(() => jsonResponse({ total: 4, data: [UNNATURAL, MOVIE, NSFW, UNRATED] })));

    const items = await catalog.search('白い');

    expect(items.map((item) => item.id)).toEqual([225581, 228021]);
    expect(items[0]).toMatchObject({
      id: 225581,
      source: 'bangumi',
      title: 'アンナチュラル',
      titleRomaji: 'UNNATURAL',
      titleAliases: ['UNNATURAL'],
      coverImage: 'https://lain.bgm.tv/pic/cover/l/0a/3f/225581_ifE52.jpg',
      bannerImage: null,
      startDate: '2018-01-12',
      description: '海外とは異なり、\n日本では…',
      score: 8.4,
      episodes: 10,
      network: 'TBSテレビ',
    });
    // 評価 0 件・話数 0・あらすじ空は「不明」として null に寄せる
    expect(items[1]).toMatchObject({ score: null, episodes: null, description: null, titleRomaji: null, titleAliases: [] });
  });

  it('merges level and recommendation from a same-titled editorial pick', async () => {
    const pick = DRAMA_PICKS.find((p) => p.titleRomaji)!;
    const subject = { ...UNNATURAL, id: 999, name: pick.title, infobox: [] };
    const catalog = createBangumiCatalog(fakeFetch(() => jsonResponse({ total: 1, data: [subject] })));

    const [item] = await catalog.search(pick.title);

    expect(item.level).toBe(pick.level);
    expect(item.recommendation?.badge).toBe(pick.badge);
    // Bangumi に別名が無くても、厳選のローマ字綴りでリソース検索できる
    expect(item.titleRomaji).toBe(pick.titleRomaji);
  });

  it('caches the same query', async () => {
    const calls: Recorded[] = [];
    const catalog = createBangumiCatalog(fakeFetch(() => jsonResponse({ total: 0, data: [] }), calls));

    await catalog.search('白い');
    await catalog.search(' 白い ');

    expect(calls).toHaveLength(1);
  });

  it('turns upstream failures into DramaUpstreamError', async () => {
    await expect(createBangumiCatalog(fakeFetch(() => jsonResponse({}, 500))).search('白い'))
      .rejects.toBeInstanceOf(DramaUpstreamError);
    await expect(createBangumiCatalog(fakeFetch(() => { throw new Error('ENOTFOUND'); })).search('白い'))
      .rejects.toThrow(/ENOTFOUND/);
    await expect(createBangumiCatalog(fakeFetch(() => new Response('<html>', { status: 200 }))).search('白い'))
      .rejects.toBeInstanceOf(DramaUpstreamError);
  });
});

describe('bangumi detail', () => {
  it('gets the subject and parses infobox aliases and network', async () => {
    const calls: Recorded[] = [];
    const catalog = createBangumiCatalog(fakeFetch(() => jsonResponse(UNNATURAL), calls));

    const drama = await catalog.detail(225581);

    expect(calls[0].url).toBe('https://api.bgm.tv/v0/subjects/225581');
    expect((calls[0].init?.headers as Record<string, string>)['user-agent']).toBe(DEFAULT_USER_AGENT);
    expect(drama).toMatchObject({ id: 225581, title: 'アンナチュラル', titleAliases: ['UNNATURAL'], network: 'TBSテレビ' });
  });

  it('accepts a plain-string alias too', async () => {
    const subject = { ...UNNATURAL, infobox: [{ key: '别名', value: 'Unnatural' }] };
    const catalog = createBangumiCatalog(fakeFetch(() => jsonResponse(subject)));

    const drama = await catalog.detail(225581);

    expect(drama?.titleAliases).toEqual(['Unnatural']);
    expect(drama?.network).toBeNull();
  });

  it('returns null for 404 and for subjects that are not japanese dramas', async () => {
    expect(await createBangumiCatalog(fakeFetch(() => jsonResponse({ title: 'Not Found' }, 404))).detail(1)).toBeNull();
    expect(await createBangumiCatalog(fakeFetch(() => jsonResponse({ ...UNNATURAL, type: 2 }))).detail(225581)).toBeNull();
    expect(await createBangumiCatalog(fakeFetch(() => jsonResponse(MOVIE))).detail(451141)).toBeNull();
  });

  it('turns a 5xx into DramaUpstreamError', async () => {
    await expect(createBangumiCatalog(fakeFetch(() => jsonResponse({}, 503))).detail(1))
      .rejects.toBeInstanceOf(DramaUpstreamError);
  });
});
