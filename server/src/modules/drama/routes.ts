import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ResourceUpstreamError,
  nyaaCategoryId,
  type ResourceCategory,
  type ResourceProvider,
} from '../resource/provider.js';
import { buildSeasonSearchQueries, inferSeasonNumber } from '../resource/season.js';
import { dramaFeatured, dramaHero, dramaLocalEntry } from './editorial.js';

export interface DramaRoutesOpts {
  resources: ResourceProvider;
}

/**
 * ドラマの既定は raw。日本のテレビ録画が大半で、
 * 日本語字幕は jimaku から取るので英語字幕は要らない。
 */
const DEFAULT_CATEGORY: ResourceCategory = 'raw';

function isCategory(value: string): value is ResourceCategory {
  return value === 'english' || value === 'raw' || value === 'all';
}

export async function dramaRoutes(app: FastifyInstance, opts: DramaRoutesOpts) {
  function externalUrl(query: string, category: ResourceCategory): string {
    const url = new URL('https://nyaa.si/');
    url.search = new URLSearchParams({
      f: '0',
      c: nyaaCategoryId('drama', category),
      q: query,
    }).toString();
    return url.toString();
  }

  /** Nyaa を引いて候補を返す。失敗時は Nyaa のサイト内検索へ逃がす */
  async function searchResources(
    reply: FastifyReply,
    queries: string[],
    category: ResourceCategory,
    season?: number,
  ) {
    const fallbackUrl = externalUrl(queries[0] ?? '', category);
    try {
      const result = await opts.resources.search(queries, category, { season, kind: 'drama' });
      return {
        ...result,
        category,
        externalSearchUrl: externalUrl(result.query || queries[0] || '', category),
      };
    } catch (error) {
      if (error instanceof ResourceUpstreamError) {
        return reply.code(502).send({
          code: 'RESOURCE_UNAVAILABLE',
          error: 'ダウンロード候補を取得できませんでした。Nyaa のサイトで検索してください。',
          externalSearchUrl: fallbackUrl,
        });
      }
      throw error;
    }
  }

  // カタログは手書きリストのみ。外部 API を持たないので失敗し得ない。
  app.get('/api/drama/home', async () => ({
    hero: dramaHero(),
    picks: dramaFeatured(),
  }));

  app.get<{ Params: { id: string } }>('/api/drama/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    }
    const drama = dramaLocalEntry(id);
    if (!drama) {
      return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
    }
    return drama;
  });

  /**
   * キーワードで Nyaa の実写カテゴリを直接引く。
   * 厳選リストに無い作品へ辿り着く唯一の導線なので、作品カタログは経由しない。
   */
  app.get<{
    Querystring: { q?: string; category?: string };
  }>('/api/drama/search', async (req, reply) => {
    const query = req.query.q?.trim() ?? '';
    if (Array.from(query).length < 2) {
      return reply.code(400).send({ code: 'INVALID_QUERY', error: '検索語は2文字以上で入力してください。' });
    }
    const category = req.query.category ?? DEFAULT_CATEGORY;
    if (!isCategory(category)) {
      return reply.code(400).send({
        code: 'INVALID_RESOURCE_CATEGORY',
        error: 'リソース分類が不正です。',
      });
    }
    // 入力そのままを 1 本の検索語として使う。作品名を推測して書き換えない。
    return searchResources(reply, [query], category);
  });

  app.get<{
    Params: { id: string };
    Querystring: { category?: string };
  }>('/api/drama/:id/resources', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    }
    const category = req.query.category ?? DEFAULT_CATEGORY;
    if (!isCategory(category)) {
      return reply.code(400).send({
        code: 'INVALID_RESOURCE_CATEGORY',
        error: 'リソース分類が不正です。',
      });
    }
    const drama = dramaLocalEntry(id);
    if (!drama) {
      return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
    }
    // 原題とローマ字の 2 系統を検索語にする（Nyaa の実写ではローマ字の方が当たる）
    const titles = [...new Map([drama.title, drama.titleRomaji]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => [value.toLocaleLowerCase(), value])).values()];
    const season = inferSeasonNumber(titles);
    return searchResources(reply, buildSeasonSearchQueries(titles, season), category, season);
  });
}
