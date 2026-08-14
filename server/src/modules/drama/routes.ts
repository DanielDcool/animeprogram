import type { FastifyInstance, FastifyReply } from 'fastify';
import { DramaUpstreamError, type CatalogDrama, type DramaCatalogClient } from './client.js';
import { dramaFeatured } from './editorial.js';
import {
  ResourceUpstreamError,
  nyaaCategoryId,
  type ResourceCategory,
  type ResourceProvider,
} from '../resource/provider.js';
import { buildSeasonSearchQueries, inferSeasonNumber } from '../resource/season.js';

export interface DramaRoutesOpts {
  /** リクエストごとに解決する。設定画面でトークンを保存した直後から有効になるように */
  getClient: () => DramaCatalogClient | null;
  resources: ResourceProvider;
}

const EMPTY_SEASON = { year: 0, season: 'WINTER' as const, items: [] };

function uniqueTitles(values: Array<string | null>): string[] {
  return [...new Map(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => [value.toLocaleLowerCase(), value])).values()];
}

function externalSearchUrl(query: string, category: ResourceCategory): string {
  const url = new URL('https://nyaa.si/');
  url.search = new URLSearchParams({ f: '0', c: nyaaCategoryId('drama', category), q: query }).toString();
  return url.toString();
}

export async function dramaRoutes(app: FastifyInstance, opts: DramaRoutesOpts) {
  /**
   * TMDB が落ちていても、厳選リストに載っている作品は詳細も資源検索も止めない。
   * Nyaa も jimaku も TMDB を経由しないので、TMDB の可用性が
   * 「このドラマを落として学習できるか」を左右するべきではない。
   * カタログ側の「AniList 障害は発見ページだけに留め、プレイヤー・単語帳・
   * ローカル走査は止めない」と同じ原則（docs/DEVELOPMENT.md §4「发现与本地学习分层」）。
   * 厳選リストに無い作品は代わりが無いので、その場合だけ 502 を投げ直す。
   */
  async function resolveDrama(id: number): Promise<CatalogDrama | null> {
    const client = opts.getClient();
    const local = dramaFeatured().find((pick) => pick.id === id) ?? null;
    if (!client) return local;
    try {
      return (await client.detail(id)) ?? local;
    } catch (error) {
      if (error instanceof DramaUpstreamError && local) return local;
      throw error;
    }
  }

  async function run<T>(reply: FastifyReply, operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DramaUpstreamError) {
        return reply.code(502).send({
          code: 'DRAMA_UNAVAILABLE',
          error: 'ドラマ情報を取得できませんでした。しばらくしてから再試行してください。',
        });
      }
      throw error;
    }
  }

  app.get('/api/drama/home', async (_req, reply) => {
    const client = opts.getClient();
    const featured = dramaFeatured();
    // トークン未設定でもエラーにしない。手書きの厳選リストだけで学習導線は成立する。
    if (!client) {
      return { current: EMPTY_SEASON, previous: EMPTY_SEASON, featured, tmdbConfigured: false };
    }
    return run(reply, async () => ({ ...await client.home(), featured, tmdbConfigured: true }));
  });

  app.get<{ Querystring: { q?: string } }>('/api/drama/search', async (req, reply) => {
    const client = opts.getClient();
    if (!client) {
      return reply.code(503).send({
        code: 'TMDB_NOT_CONFIGURED',
        error: 'TMDB のトークンを設定すると、すべてのドラマを検索できます。',
      });
    }
    const query = req.query.q?.trim() ?? '';
    if (Array.from(query).length < 2) {
      return reply.code(400).send({ code: 'INVALID_QUERY', error: '検索語は2文字以上で入力してください。' });
    }
    return run(reply, async () => ({ items: await client.search(query) }));
  });

  app.get<{ Params: { id: string } }>('/api/drama/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    }
    return run(reply, async () => {
      const drama = await resolveDrama(id);
      if (drama) return drama;
      return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
    });
  });

  app.get<{
    Params: { id: string };
    Querystring: { category?: string };
  }>('/api/drama/:id/resources', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    }

    // ドラマの既定は raw。日本のテレビ録画が大半で、英語字幕は日本語学習に不要。
    const category = req.query.category ?? 'raw';
    if (category !== 'english' && category !== 'raw' && category !== 'all') {
      return reply.code(400).send({
        code: 'INVALID_RESOURCE_CATEGORY',
        error: 'リソース分類が不正です。',
      });
    }

    let fallbackUrl = '';
    try {
      const source = await resolveDrama(id);
      if (!source) {
        return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
      }
      const titles = uniqueTitles([source.titleNative ?? source.title, source.titleEnglish]);
      const season = inferSeasonNumber(titles);
      const queries = buildSeasonSearchQueries(titles, season);
      fallbackUrl = externalSearchUrl(queries[0] ?? '', category);
      const result = await opts.resources.search(queries, category, { season, kind: 'drama' });
      return {
        ...result,
        category,
        externalSearchUrl: externalSearchUrl(result.query || queries[0] || '', category),
      };
    } catch (error) {
      if (error instanceof DramaUpstreamError) {
        return reply.code(502).send({
          code: 'DRAMA_UNAVAILABLE',
          error: 'ドラマ情報を取得できませんでした。しばらくしてから再試行してください。',
        });
      }
      if (error instanceof ResourceUpstreamError) {
        return reply.code(502).send({
          code: 'RESOURCE_UNAVAILABLE',
          error: 'ダウンロード候補を取得できませんでした。Nyaa のサイトで検索してください。',
          externalSearchUrl: fallbackUrl,
        });
      }
      throw error;
    }
  });
}
