import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { tokenize } from './tokenizer.js';
import { lookup } from './dictionary.js';

export async function analyzeRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.post<{ Body: { text: string } }>('/api/analyze', async (req, reply) => {
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: 'text required' });
    const tokens = await tokenize(text);
    return {
      tokens: tokens.map((t) => ({
        ...t,
        glosses: t.pos === '記号' ? [] : lookup(db, t.base),
      })),
    };
  });
}
