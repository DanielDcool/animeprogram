import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/modules/analyze/tokenizer.js';

describe('tokenize', () => {
  it('tokenizes a sentence with base form and hiragana reading', async () => {
    const tokens = await tokenize('あんたのことが好きなんだよ');
    const surfaces = tokens.map((t) => t.surface);
    expect(surfaces).toContain('あんた');
    expect(surfaces).toContain('好き');
    const suki = tokens.find((t) => t.surface === '好き')!;
    expect(suki.reading).toBe('すき');
    expect(suki.pos).toBe('名詞');
  });

  it('restores dictionary form of conjugated verbs', async () => {
    const tokens = await tokenize('食べた');
    const tabe = tokens.find((t) => t.surface === '食べ')!;
    expect(tabe.base).toBe('食べる');
    expect(tabe.pos).toBe('動詞');
  });
}, 30_000);
