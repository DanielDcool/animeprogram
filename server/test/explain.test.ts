import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import { createDb, setSetting } from '../src/db.js';
import { explainSentence, type ExplainClient } from '../src/modules/ai/explain.js';
import { aiRoutes } from '../src/modules/ai/routes.js';

const EXPLANATION = {
  translation: '即便如此，我还是喜欢你啊。',
  structure: '「〜のことが好き」…',
  expressions: [{ expression: 'なんだよ', meaning: 'のだ＋よ，强调说明语气' }],
  nuance: '口语、亲密场合',
};

function fakeClient(): ExplainClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(EXPLANATION) }],
      }),
    },
  } as any;
}

describe('explainSentence', () => {
  it('parses structured response', async () => {
    const client = fakeClient();
    const result = await explainSentence(client, 'claude-opus-4-8', { text: 'それでも、あたしはあんたのことが好きなんだよ', context: [] });
    expect(result.translation).toContain('喜欢');
    expect((client.messages.create as any).mock.calls[0][0].model).toBe('claude-opus-4-8');
    const system = (client.messages.create as any).mock.calls[0][0].system as string;
    expect(system).toContain('解説対象の台詞に含まれる日本語の漢字だけ');
    expect(system).toContain('一発（いっぱつ）');
    expect(system).toContain('名詞、動詞、仮定形、推量');
    expect(system).toContain('読み仮名を付けない');
    expect(system).not.toContain('毎回読み仮名を添え');
  });
});

describe('POST /api/explain', () => {
  it('caches by sentence: second call does not hit client', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'anthropic_api_key', 'sk-test');
    const client = fakeClient();
    const app = Fastify();
    app.register(aiRoutes, { db, clientFactory: () => client });

    const payload = { text: 'テスト文', context: ['前の文'] };
    const r1 = await app.inject({ method: 'POST', url: '/api/explain', payload });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().cached).toBe(false);

    const r2 = await app.inject({ method: 'POST', url: '/api/explain', payload });
    expect(r2.json().cached).toBe(true);
    expect((client.messages.create as any).mock.calls.length).toBe(1);
  });

  it('regenerates explanations cached under the broad furigana policy', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'anthropic_api_key', 'sk-test');
    const oldHash = crypto.createHash('sha256').update('furigana-v2:anthropic:claude-opus-4-8:テスト文').digest('hex');
    db.prepare('INSERT INTO explain_cache (sentence_hash, sentence_text, response_json) VALUES (?,?,?)')
      .run(oldHash, 'テスト文', JSON.stringify(EXPLANATION));
    const client = fakeClient();
    const app = Fastify();
    app.register(aiRoutes, { db, clientFactory: () => client });

    const res = await app.inject({ method: 'POST', url: '/api/explain', payload: { text: 'テスト文' } });

    expect(res.json().cached).toBe(false);
    expect((client.messages.create as any).mock.calls).toHaveLength(1);
  });

  it('503 with code when api key not configured', async () => {
    const db = createDb(':memory:');
    const app = Fastify();
    app.register(aiRoutes, { db, clientFactory: () => fakeClient() });
    const res = await app.inject({ method: 'POST', url: '/api/explain', payload: { text: 'x' } });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('AI_NOT_CONFIGURED');
  });

  it('uses DeepSeek JSON mode when selected', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'ai_provider', 'deepseek');
    setSetting(db, 'deepseek_api_key', 'sk-test');
    setSetting(db, 'ai_model', 'deepseek-v4-flash');
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(EXPLANATION) } }],
    })));
    const app = Fastify();
    app.register(aiRoutes, { db, deepseekFetch: fetchFn });

    const res = await app.inject({ method: 'POST', url: '/api/explain', payload: { text: 'テスト文' } });

    expect(res.statusCode).toBe(200);
    expect(res.json().explanation).toEqual(EXPLANATION);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }) }),
    );
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
    });
    const system = JSON.parse(fetchFn.mock.calls[0][1].body).messages[0].content as string;
    expect(system).toContain('解説対象の台詞に含まれる日本語の漢字だけ');
    expect(system).toContain('読み仮名を付けない');
  });

  it('uses OpenAI Responses API with structured output when selected', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'ai_provider', 'openai');
    setSetting(db, 'openai_api_key', 'sk-openai-test');
    setSetting(db, 'ai_model', 'gpt-5.6-sol');
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(EXPLANATION) }],
      }],
    })));
    const app = Fastify();
    app.register(aiRoutes, { db, openaiFetch: fetchFn });

    const res = await app.inject({ method: 'POST', url: '/api/explain', payload: { text: 'テスト文' } });

    expect(res.statusCode).toBe(200);
    expect(res.json().explanation).toEqual(EXPLANATION);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk-openai-test' }) }),
    );
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gpt-5.6-sol',
      text: {
        format: {
          type: 'json_schema',
          name: 'japanese_explanation',
          strict: true,
        },
      },
    });
    expect(body.instructions).toContain('解説対象の台詞に含まれる日本語の漢字だけ');
    expect(body.instructions).toContain('読み仮名を付けない');
  });

  it('joins Gemini text chunks and uses structured output when selected', async () => {
    const db = createDb(':memory:');
    setSetting(db, 'ai_provider', 'gemini');
    setSetting(db, 'gemini_api_key', 'gemini-test-key');
    setSetting(db, 'ai_model', 'gemini-3.6-flash');
    const serialized = JSON.stringify(EXPLANATION);
    const splitAt = Math.floor(serialized.length / 2);
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'completed',
      steps: [{
        type: 'model_output',
        content: [
          { type: 'text', text: serialized.slice(0, splitAt) },
          { type: 'text', text: serialized.slice(splitAt) },
        ],
      }],
    })));
    const app = Fastify();
    app.register(aiRoutes, { db, geminiFetch: fetchFn });

    const res = await app.inject({ method: 'POST', url: '/api/explain', payload: { text: 'テスト文' } });

    expect(res.statusCode).toBe(200);
    expect(res.json().explanation).toEqual(EXPLANATION);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-test-key' }) }),
    );
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gemini-3.6-flash',
      store: false,
      generation_config: { max_output_tokens: 4096, thinking_level: 'low' },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: { type: 'object' },
      },
    });
    expect(body.system_instruction).toContain('解説対象の台詞に含まれる日本語の漢字だけ');
    expect(body.system_instruction).toContain('読み仮名を付けない');
  });
});
