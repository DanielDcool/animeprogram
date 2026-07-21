import { describe, it, expect } from 'vitest';
import { createDb } from '../src/db.js';
import { insertEntry, lookup } from '../src/modules/analyze/dictionary.js';

describe('dictionary', () => {
  it('looks up by kanji and by kana', () => {
    const db = createDb(':memory:');
    insertEntry(db, { kanji: ['好き'], kana: ['すき'], gloss: ['liking; being fond of'] });
    insertEntry(db, { kanji: [], kana: ['あんた'], gloss: ['you (informal)'] });

    expect(lookup(db, '好き')[0].gloss).toContain('liking');
    expect(lookup(db, 'すき')[0].gloss).toContain('liking');
    expect(lookup(db, 'あんた')[0].gloss).toContain('you');
    expect(lookup(db, '存在しない語')).toEqual([]);
  });
});
