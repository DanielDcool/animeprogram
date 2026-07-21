import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createDb } from '../src/db.js';
import { importJmdict } from '../src/modules/analyze/jmdict-import.js';
import { insertEntry, lookup } from '../src/modules/analyze/dictionary.js';

describe('importJmdict', () => {
  it('streams JMdict words into a fresh dictionary', async () => {
    const db = createDb(':memory:');
    insertEntry(db, { kanji: ['古い'], kana: ['ふるい'], gloss: ['old'] });
    const source = Readable.from([
      JSON.stringify({
        words: [
          {
            kanji: [{ text: '好き' }],
            kana: [{ text: 'すき' }],
            sense: [{ gloss: [{ text: 'liking' }, { text: 'fondness' }] }],
          },
          {
            kanji: [],
            kana: [{ text: 'あんた' }],
            sense: [{ gloss: [{ text: 'you (informal)' }] }],
          },
        ],
      }),
    ]);

    await expect(importJmdict(db, source)).resolves.toBe(2);
    expect(lookup(db, '古い')).toEqual([]);
    expect(lookup(db, '好き')[0]).toMatchObject({ kana: 'すき', gloss: 'liking; fondness' });
    expect(lookup(db, 'あんた')[0].gloss).toBe('you (informal)');
  });
});
