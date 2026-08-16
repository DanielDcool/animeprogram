import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ResourceUpstreamError,
  nyaaCategoryId,
  type ResourceCategory,
  type ResourceProvider,
} from '../resource/provider.js';
import { hasJapanese } from '../analyze/romaji.js';
import { buildSeasonSearchQueries, inferSeasonNumber } from '../resource/season.js';
import { DramaUpstreamError, type DramaCatalogClient } from './bangumi.js';
import { dramaFeatured, dramaHero, dramaLocalEntry, type CatalogDrama } from './editorial.js';

/** 日本語の入力をリリース側の綴りに寄せる。差し替え可能にしてテストでは実辞書を読まない */
export type RomajiTransliterator = (text: string) => Promise<string>;

export interface DramaRoutesOpts {
  resources: ResourceProvider;
  /** 検索窓の作品カタログ（Bangumi）。トップの厳選リストはこれを経由しない */
  catalog: DramaCatalogClient;
  toRomaji?: RomajiTransliterator;
}

/**
 * ドラマの既定は「すべて」。
 * 当初は raw を既定にしていたが、通しのパックは多言語字幕付きで配布されることが多く、
 * raw（4_4）だと候補から漏れてしまう。実測（2026-08-15）:
 *   VIVANT   raw → 外伝 2.4 GiB / all → 通し 25.3 GiB
 *   カルテット raw → 単話 0.5 GiB / all → 全 10 話 + 特典 13.1 GiB
 * 日本語字幕は jimaku から別途取るので、内蔵字幕の有無で絞る必要はない。
 */
const DEFAULT_CATEGORY: ResourceCategory = 'all';

function isCategory(value: string): value is ResourceCategory {
  return value === 'english' || value === 'raw' || value === 'all';
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function uniqueTitles(values: Array<string | null | undefined>): string[] {
  return [...new Map(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => [value.toLocaleLowerCase(), value])).values()];
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

  /** Bangumi 側の失敗は 502 に寄せる。厳選リストと Nyaa は経由しないので巻き添えにしない */
  async function runCatalog<T>(reply: FastifyReply, operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DramaUpstreamError) {
        reply.log.warn({ reason: error.message }, 'Bangumi から作品情報を取得できませんでした。');
        return reply.code(502).send({
          code: 'DRAMA_UNAVAILABLE',
          error: '作品情報を取得できませんでした。しばらくしてから再試行してください。',
          reason: error.message,
        });
      }
      throw error;
    }
  }

  /**
   * 作品の原題とリリース側の綴りをまとめて検索語にする。
   * ラテン文字の別名が 1 つも無いときだけ、読みのローマ字を第 2 検索語に足す。
   */
  async function titleQueries(drama: CatalogDrama): Promise<{ queries: string[]; season: number | undefined }> {
    const titles = uniqueTitles([drama.title, drama.titleRomaji, ...drama.titleAliases]);
    const queries = titles.length > 1 ? titles : await queryVariants(drama.title);
    const season = inferSeasonNumber(titles);
    return { queries: buildSeasonSearchQueries(queries, season), season };
  }

  function readCategory(reply: FastifyReply, raw: string | undefined): ResourceCategory | null {
    const category = raw ?? DEFAULT_CATEGORY;
    if (isCategory(category)) return category;
    void reply.code(400).send({ code: 'INVALID_RESOURCE_CATEGORY', error: 'リソース分類が不正です。' });
    return null;
  }

  function readQuery(reply: FastifyReply, raw: string | undefined): string | null {
    const query = raw?.trim() ?? '';
    if (Array.from(query).length >= 2) return query;
    void reply.code(400).send({ code: 'INVALID_QUERY', error: '検索語は2文字以上で入力してください。' });
    return null;
  }

  // トップは手書きリストのみ。外部 API を持たないので失敗し得ない。
  app.get('/api/drama/home', async () => ({
    hero: dramaHero(),
    picks: dramaFeatured(),
  }));

  /** キーワードで Bangumi を引き、作品カードの列を返す */
  app.get<{ Querystring: { q?: string } }>('/api/drama/search', async (req, reply) => {
    const query = readQuery(reply, req.query.q);
    if (query == null) return reply;
    return runCatalog(reply, async () => ({ items: await opts.catalog.search(query) }));
  });

  /**
   * キーワードで Nyaa の実写カテゴリを直接引く。
   * カタログにも厳選にも無い作品へ辿り着く導線なので、作品カタログは経由しない。
   */
  app.get<{
    Querystring: { q?: string; category?: string };
  }>('/api/drama/search/resources', async (req, reply) => {
    const query = readQuery(reply, req.query.q);
    if (query == null) return reply;
    const category = readCategory(reply, req.query.category);
    if (category == null) return reply;
    // まず入力そのまま。0 件なら読みのローマ字で引き直す。
    // 実写のリリース名はローマ字表記が多く、日本語の原題では当たらないことがある
    // （2026-08-15 実測「きのう何食べた」0 件 →「Kinou Nani Tabeta」48 件、全て該当作）。
    return searchResources(reply, await queryVariants(query), category);
  });

  // ---- Bangumi の作品（検索結果から辿る）。厳選リストと id の名前空間が違うので別プレフィックス ----

  app.get<{ Params: { id: string } }>('/api/drama/bgm/:id', async (req, reply) => {
    const id = parseId(req.params.id);
    if (id == null) return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    return runCatalog(reply, async () => {
      const drama = await opts.catalog.detail(id);
      if (!drama) return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
      return drama;
    });
  });

  app.get<{
    Params: { id: string };
    Querystring: { category?: string };
  }>('/api/drama/bgm/:id/resources', async (req, reply) => {
    const id = parseId(req.params.id);
    if (id == null) return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    const category = readCategory(reply, req.query.category);
    if (category == null) return reply;
    return runCatalog(reply, async () => {
      const drama = await opts.catalog.detail(id);
      if (!drama) return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
      const { queries, season } = await titleQueries(drama);
      return searchResources(reply, queries, category, season);
    });
  });

  // ---- 厳選リストの作品（トップから辿る） ----

  app.get<{ Params: { id: string } }>('/api/drama/:id', async (req, reply) => {
    const id = parseId(req.params.id);
    if (id == null) return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    const drama = dramaLocalEntry(id);
    if (!drama) return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
    return drama;
  });

  app.get<{
    Params: { id: string };
    Querystring: { category?: string };
  }>('/api/drama/:id/resources', async (req, reply) => {
    const id = parseId(req.params.id);
    if (id == null) return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    const category = readCategory(reply, req.query.category);
    if (category == null) return reply;
    const drama = dramaLocalEntry(id);
    if (!drama) return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
    // 原題とローマ字の 2 系統を検索語にする（Nyaa の実写ではローマ字の方が当たる）
    const { queries, season } = await titleQueries(drama);
    return searchResources(reply, queries, category, season);
  });
}
