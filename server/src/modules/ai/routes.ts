import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';
import { getSetting, type Db } from '../../db.js';
import { explainSentence, type ExplainClient } from './explain.js';

interface Opts {
  db: Db;
  clientFactory?: (apiKey: string) => ExplainClient;
}

export async function aiRoutes(app: FastifyInstance, opts: Opts) {
  const { db, clientFactory = (apiKey: string) => new Anthropic({ apiKey }) } = opts;

  app.post<{ Body: { text: string; context?: string[] } }>('/api/explain', async (req, reply) => {
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: 'text required' });

    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const cached = db.prepare('SELECT response_json FROM explain_cache WHERE sentence_hash=?').get(hash) as any;
    if (cached) return { cached: true, explanation: JSON.parse(cached.response_json) };

    const apiKey = getSetting(db, 'anthropic_api_key');
    if (!apiKey) return reply.code(503).send({ code: 'AI_NOT_CONFIGURED', error: 'Anthropic API key not set (settings page)' });

    const model = getSetting(db, 'ai_model') ?? 'claude-opus-4-8';
    try {
      const explanation = await explainSentence(clientFactory(apiKey), model, {
        text, context: req.body.context ?? [],
      });
      db.prepare('INSERT INTO explain_cache (sentence_hash, sentence_text, response_json) VALUES (?,?,?)')
        .run(hash, text, JSON.stringify(explanation));
      return { cached: false, explanation };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(502).send({ code: 'AI_ERROR', error: String(err?.message ?? err) });
    }
  });
}
