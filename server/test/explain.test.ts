import { describe, it, expect, vi } from 'vitest';
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

  it('503 with code when api key not configured', async () => {
    const db = createDb(':memory:');
    const app = Fastify();
    app.register(aiRoutes, { db, clientFactory: () => fakeClient() });
    const res = await app.inject({ method: 'POST', url: '/api/explain', payload: { text: 'x' } });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('AI_NOT_CONFIGURED');
  });
});
