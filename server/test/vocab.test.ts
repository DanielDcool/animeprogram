import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { createDb, type Db } from '../src/db.js';
import { vocabRoutes } from '../src/modules/vocab/routes.js';

let db: Db;
function makeApp() {
  const app = Fastify();
  app.register(vocabRoutes, { db });
  return app;
}

beforeEach(() => {
  db = createDb(':memory:');
  db.prepare(`INSERT INTO media (id, series, episode, file_path) VALUES (1, 'Frieren', 3, '/f3.mkv')`).run();
});

const wordPayload = {
  kind: 'word', word: '食べる', reading: 'たべる', gloss: 'to eat',
  sentence: '食べたら帰ろうか', mediaId: 1, positionSec: 17.5,
};
const sentencePayload = {
  kind: 'sentence', sentence: '食べたら帰ろうか', translation: '吃完就回去吧', mediaId: 1, positionSec: 17.5,
};

describe('POST /api/vocab', () => {
  it('saves word and sentence items', async () => {
    const app = makeApp();
    const r1 = await app.inject({ method: 'POST', url: '/api/vocab', payload: wordPayload });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().saved).toBe(true);
    const r2 = await app.inject({ method: 'POST', url: '/api/vocab', payload: sentencePayload });
    expect(r2.json().saved).toBe(true);
    expect(db.prepare('SELECT COUNT(*) c FROM vocab').get()).toEqual({ c: 2 });
  });

  it('duplicate save is ignored (saved: false)', async () => {
    const app = makeApp();
    await app.inject({ method: 'POST', url: '/api/vocab', payload: wordPayload });
    const dup = await app.inject({ method: 'POST', url: '/api/vocab', payload: wordPayload });
    expect(dup.json().saved).toBe(false);
    expect(db.prepare('SELECT COUNT(*) c FROM vocab').get()).toEqual({ c: 1 });
  });

  it('400 without sentence', async () => {
    const res = await makeApp().inject({ method: 'POST', url: '/api/vocab', payload: { kind: 'word' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/vocab', () => {
  it('lists items newest-first with media context', async () => {
    const app = makeApp();
    await app.inject({ method: 'POST', url: '/api/vocab', payload: wordPayload });
    await app.inject({ method: 'POST', url: '/api/vocab', payload: sentencePayload });
    const res = await app.inject({ url: '/api/vocab' });
    const items = res.json();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ series: 'Frieren', episode: 3 });
    expect(items.map((i: any) => i.kind).sort()).toEqual(['sentence', 'word']);
  });
});

describe('GET /api/vocab/:id', () => {
  it('returns media context and the latest cached AI explanation for the sentence', async () => {
    const app = makeApp();
    await app.inject({ method: 'POST', url: '/api/vocab', payload: wordPayload });
    const id = (await app.inject({ url: '/api/vocab' })).json()[0].id;
    const explanation = {
      translation: '吃完就回去吧',
      structure: '条件表达',
      expressions: [{ expression: '〜たら', meaning: '表示条件' }],
      nuance: '轻松的提议',
    };
    db.prepare(`INSERT INTO explain_cache (sentence_hash, sentence_text, response_json) VALUES ('old','食べたら帰ろうか','{}')`).run();
    db.prepare(`INSERT INTO explain_cache (sentence_hash, sentence_text, response_json) VALUES ('new','食べたら帰ろうか',?)`).run(JSON.stringify(explanation));

    const res = await app.inject({ url: `/api/vocab/${id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id,
      word: '食べる',
      series: 'Frieren',
      episode: 3,
      mediaId: 1,
      positionSec: 17.5,
      aiExplanation: explanation,
    });
  });

  it('returns null when the sentence has no cached AI explanation', async () => {
    const app = makeApp();
    await app.inject({ method: 'POST', url: '/api/vocab', payload: sentencePayload });
    const id = (await app.inject({ url: '/api/vocab' })).json()[0].id;

    const res = await app.inject({ url: `/api/vocab/${id}` });

    expect(res.json().aiExplanation).toBeNull();
  });

  it('returns 404 for an unknown item', async () => {
    const res = await makeApp().inject({ url: '/api/vocab/999' });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/vocab/:id', () => {
  it('removes an item', async () => {
    const app = makeApp();
    await app.inject({ method: 'POST', url: '/api/vocab', payload: wordPayload });
    const id = (await app.inject({ url: '/api/vocab' })).json()[0].id;
    const del = await app.inject({ method: 'DELETE', url: `/api/vocab/${id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/vocab' })).json()).toHaveLength(0);
  });
});

describe('GET /api/vocab/export.tsv', () => {
  it('exports word and sentence cards as front<TAB>back', async () => {
    const app = makeApp();
    await app.inject({ method: 'POST', url: '/api/vocab', payload: wordPayload });
    await app.inject({ method: 'POST', url: '/api/vocab', payload: sentencePayload });
    const res = await app.inject({ url: '/api/vocab/export.tsv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/tab-separated-values');
    const lines = res.payload.trim().split('\n');
    expect(lines).toHaveLength(2);
    const word = lines.find((l) => l.startsWith('食べる\t'))!;
    expect(word).toContain('たべる');
    expect(word).toContain('to eat');
    expect(word).toContain('食べたら帰ろうか');
    const sent = lines.find((l) => l.startsWith('食べたら帰ろうか\t'))!;
    expect(sent).toContain('吃完就回去吧');
  });
});
