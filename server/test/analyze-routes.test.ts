import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createDb } from '../src/db.js';
import { insertEntry } from '../src/modules/analyze/dictionary.js';
import { analyzeRoutes } from '../src/modules/analyze/routes.js';

describe('POST /api/analyze', () => {
  it('returns tokens with dictionary glosses looked up by base form', async () => {
    const db = createDb(':memory:');
    insertEntry(db, { kanji: ['食べる'], kana: ['たべる'], gloss: ['to eat'] });
    const app = Fastify();
    app.register(analyzeRoutes, { db });

    const res = await app.inject({ method: 'POST', url: '/api/analyze', payload: { text: '食べた' } });
    expect(res.statusCode).toBe(200);
    const { tokens } = res.json();
    const tabe = tokens.find((t: any) => t.base === '食べる');
    expect(tabe.glosses[0].gloss).toBe('to eat');
  });

  it('400 on empty text', async () => {
    const app = Fastify();
    app.register(analyzeRoutes, { db: createDb(':memory:') });
    const res = await app.inject({ method: 'POST', url: '/api/analyze', payload: { text: '' } });
    expect(res.statusCode).toBe(400);
  });
}, 30_000);
