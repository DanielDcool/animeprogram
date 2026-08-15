import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ResourceUpstreamError,
  nyaaCategoryId,
  type ResourceCategory,
  type ResourceProvider,
} from '../resource/provider.js';
import { hasJapanese } from '../analyze/romaji.js';
import { buildSeasonSearchQueries, inferSeasonNumber } from '../resource/season.js';
import { dramaFeatured, dramaHero, dramaLocalEntry } from './editorial.js';

/** 日本語の入力をリリース側の綴りに寄せる。差し替え可能にしてテストでは実辞書を読まない */
export type RomajiTransliterator = (text: string) => Promise<string>;

export interface DramaRoutesOpts {
  resources: ResourceProvider;
  toRomaji?: RomajiTransliterator;
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

  /**
   * 検索語を順に試すためのリスト。provider は最初に当たったものを返す。
   * 翻字に失敗しても検索自体は続ける（辞書の読み込み失敗で検索窓が死なないように）。
   */
  async function queryVariants(query: string): Promise<string[]> {
    if (!opts.toRomaji || !hasJapanese(query)) return [query];
    try {
      const romaji = (await opts.toRomaji(query)).trim();
      return romaji && romaji !== query ? [query, romaji] : [query];
    } catch {
      return [query];
    }
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
        // 端末に理由を残す。国内からの直結不可やプロキシ未設定は、ここを見れば一目で分かる
        reply.log.warn(
          { reason: error.message },
          'nyaa.si からダウンロード候補を取得できませんでした。'
          + 'プロキシが必要な環境では NODE_USE_ENV_PROXY=1 と HTTPS_PROXY を設定して起動してください。',
        );
        return reply.code(502).send({
          code: 'RESOURCE_UNAVAILABLE',
          error: 'ダウンロード候補を取得できませんでした。Nyaa のサイトで検索してください。',
          reason: error.message,
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
    // まず入力そのまま。0 件なら読みのローマ字で引き直す。
    // 実写のリリース名はローマ字表記が多く、日本語の原題では当たらないことがある
    // （2026-08-15 実測「きのう何食べた」0 件 →「Kinou Nani Tabeta」48 件、全て該当作）。
    return searchResources(reply, await queryVariants(query), category);
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
