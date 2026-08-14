import type { FastifyInstance } from 'fastify';
import {
  CatalogUpstreamError,
  type CatalogClient,
} from '../catalog/client.js';
import {
  ResourceUpstreamError,
  nyaaCategoryId,
  type ContentKind,
  type ResourceCategory,
  type ResourceProvider,
} from './provider.js';
import { buildSeasonSearchQueries, inferSeasonNumber } from './season.js';

interface Opts {
  catalog: CatalogClient;
  resources: ResourceProvider;
}

function uniqueTitles(values: Array<string | null>): string[] {
  return [...new Map(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => [value.toLocaleLowerCase(), value])).values()];
}

function externalSearchUrl(query: string, kind: ContentKind, category: ResourceCategory): string {
  const url = new URL('https://nyaa.si/');
  url.search = new URLSearchParams({ f: '0', c: nyaaCategoryId(kind, category), q: query }).toString();
  return url.toString();
}

export async function resourceRoutes(app: FastifyInstance, opts: Opts) {
  app.get<{
    Params: { id: string };
    Querystring: { category?: string };
  }>('/api/catalog/anime/:id/resources', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ code: 'INVALID_ANIME_ID', error: '作品IDが不正です。' });
    }

    const category = req.query.category ?? 'english';
    if (category !== 'english' && category !== 'raw' && category !== 'all') {
      return reply.code(400).send({
        code: 'INVALID_RESOURCE_CATEGORY',
        error: 'リソース分類が不正です。',
      });
    }

    let fallbackUrl = '';
    try {
      const anime = await opts.catalog.detail(id);
      if (!anime) {
        return reply.code(404).send({ code: 'ANIME_NOT_FOUND', error: '作品が見つかりません。' });
      }
      const titles = uniqueTitles([
        anime.titleNative ?? anime.title,
        anime.titleRomaji,
        anime.titleEnglish,
      ]);
      const season = inferSeasonNumber(titles);
      const queries = buildSeasonSearchQueries(titles, season);
      fallbackUrl = externalSearchUrl(queries[0] ?? '', 'anime', category);
      const result = await opts.resources.search(queries, category, { season, kind: 'anime' });
      return {
        ...result,
        category,
        externalSearchUrl: externalSearchUrl(result.query || queries[0] || '', 'anime', category),
      };
    } catch (error) {
      if (error instanceof CatalogUpstreamError) {
        return reply.code(502).send({
          code: 'CATALOG_UNAVAILABLE',
          error: 'アニメ情報を取得できませんでした。しばらくしてから再試行してください。',
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
