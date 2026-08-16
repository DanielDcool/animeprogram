import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';
import { getSetting, type Db } from '../../db.js';
import {
  explainSentence,
  explainSentenceWithDeepSeek,
  explainSentenceWithGemini,
  explainSentenceWithOpenAI,
  type Explanation,
  type ExplainClient,
} from './explain.js';
import { resolveExplainLanguage } from './language.js';

// キャッシュキーの形式版。言語をキーに含めるようになったので v4（旧 v3 の結果は再生成される）
const EXPLANATION_FORMAT_VERSION = 'explain-lang-v4';
type AiProvider = 'anthropic' | 'deepseek' | 'openai' | 'gemini';

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-opus-4-8',
  deepseek: 'deepseek-v4-flash',
  openai: 'gpt-5.6-sol',
  gemini: 'gemini-3.6-flash',
};

function getProvider(db: Db): AiProvider {
  const configured = getSetting(db, 'ai_provider');
  return configured === 'deepseek' || configured === 'openai' || configured === 'gemini'
    ? configured
    : 'anthropic';
}

interface Opts {
  db: Db;
  clientFactory?: (apiKey: string) => ExplainClient;
  deepseekFetch?: typeof fetch;
  openaiFetch?: typeof fetch;
  geminiFetch?: typeof fetch;
}

export async function aiRoutes(app: FastifyInstance, opts: Opts) {
  const {
    db,
    clientFactory = (apiKey: string) => new Anthropic({ apiKey }),
    deepseekFetch = fetch,
    openaiFetch = fetch,
    geminiFetch = fetch,
  } = opts;

  app.post<{ Body: { text: string; context?: string[] } }>('/api/explain', async (req, reply) => {
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: 'text required' });

    const provider = getProvider(db);
    const model = getSetting(db, 'ai_model') ?? DEFAULT_MODELS[provider];
    // 設定で固定されていなければブラウザの言語（≒ OS の言語）に従う
    const language = resolveExplainLanguage(getSetting(db, 'explain_language'), req.headers['accept-language']);
    const hash = crypto.createHash('sha256')
      .update(`${EXPLANATION_FORMAT_VERSION}:${provider}:${model}:${language}:${text}`)
      .digest('hex');
    const cached = db.prepare('SELECT response_json FROM explain_cache WHERE sentence_hash=?').get(hash) as any;
    if (cached) return { cached: true, explanation: JSON.parse(cached.response_json) };

    const apiKey = getSetting(db, `${provider}_api_key`);
    if (!apiKey) return reply.code(503).send({ code: 'AI_NOT_CONFIGURED', error: 'AI API key not set (settings page)' });

    try {
      const input = { text, context: req.body.context ?? [], language };
      let explanation: Explanation;
      if (provider === 'deepseek') {
        explanation = await explainSentenceWithDeepSeek(apiKey, model, input, deepseekFetch);
      } else if (provider === 'openai') {
        explanation = await explainSentenceWithOpenAI(apiKey, model, input, openaiFetch);
      } else if (provider === 'gemini') {
        explanation = await explainSentenceWithGemini(apiKey, model, input, geminiFetch);
      } else {
        explanation = await explainSentence(clientFactory(apiKey), model, input);
      }
      db.prepare('INSERT INTO explain_cache (sentence_hash, sentence_text, response_json) VALUES (?,?,?)')
        .run(hash, text, JSON.stringify(explanation));
      return { cached: false, explanation };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(502).send({ code: 'AI_ERROR', error: String(err?.message ?? err) });
    }
  });
}
