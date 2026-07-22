import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  CatalogUpstreamError,
  type CatalogClient,
} from './client.js';

interface Opts {
  client: CatalogClient;
}

export async function catalogRoutes(app: FastifyInstance, opts: Opts) {
  async function run<T>(reply: FastifyReply, operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CatalogUpstreamError) {
        return reply.code(502).send({
          code: 'CATALOG_UNAVAILABLE',
          error: 'アニメ情報を取得できませんでした。しばらくしてから再試行してください。',
        });
      }
      throw error;
    }
  }

  app.get('/api/catalog/home', async (_req, reply) => run(reply, () => opts.client.home()));

  app.get<{ Querystring: { q?: string } }>('/api/catalog/search', async (req, reply) => {
    const query = req.query.q?.trim() ?? '';
    if (Array.from(query).length < 2) {
      return reply.code(400).send({ code: 'INVALID_QUERY', error: '検索語は2文字以上で入力してください。' });
    }
    return run(reply, async () => ({ items: await opts.client.search(query) }));
  });

  app.get<{ Params: { id: string } }>('/api/catalog/anime/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ code: 'INVALID_ANIME_ID', error: '作品IDが不正です。' });
    }
    return run(reply, async () => {
      const anime = await opts.client.detail(id);
      if (!anime) return reply.code(404).send({ code: 'ANIME_NOT_FOUND', error: '作品が見つかりません。' });
      return anime;
    });
  });
}
