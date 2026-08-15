import { describe, expect, it } from 'vitest';
import { hiraganaToRomaji, hasJapanese, romajiSearchTerm } from '../src/modules/analyze/romaji.js';

describe('hasJapanese', () => {
  it('detects kana and kanji, ignores latin', () => {
    expect(hasJapanese('孤独のグルメ')).toBe(true);
    expect(hasJapanese('きのう')).toBe(true);
    expect(hasJapanese('カルテット')).toBe(true);
    expect(hasJapanese('Kodoku no Gurume')).toBe(false);
    expect(hasJapanese('MIU404')).toBe(false);
  });
});

describe('hiraganaToRomaji', () => {
  it('converts plain syllables', () => {
    expect(hiraganaToRomaji('こどく')).toBe('kodoku');
    expect(hiraganaToRomaji('はんざわなおき')).toBe('hanzawanaoki');
  });

  it('uses hepburn spellings for the irregular rows', () => {
    expect(hiraganaToRomaji('しつじ')).toBe('shitsuji');
    expect(hiraganaToRomaji('ちかん')).toBe('chikan');
    expect(hiraganaToRomaji('ふゆ')).toBe('fuyu');
  });

  it('handles youon', () => {
    expect(hiraganaToRomaji('きゃく')).toBe('kyaku');
    expect(hiraganaToRomaji('じゅう')).toBe('juu');
    expect(hiraganaToRomaji('しょう')).toBe('shou');
  });

  it('doubles the consonant after a small tsu', () => {
    expect(hiraganaToRomaji('がっこう')).toBe('gakkou');
    expect(hiraganaToRomaji('いっしょ')).toBe('issho');
  });

  it('keeps n before consonants and vowels alike', () => {
    expect(hiraganaToRomaji('しんぶん')).toBe('shinbun');
    expect(hiraganaToRomaji('あんない')).toBe('annai');
  });

  it('drops the katakana長音 mark', () => {
    expect(hiraganaToRomaji('ぐるめ')).toBe('gurume');
    expect(hiraganaToRomaji('かるてっと')).toBe('karutetto');
  });

  it('leaves characters it does not know alone', () => {
    expect(hiraganaToRomaji('MIU404')).toBe('MIU404');
  });
});

describe('romajiSearchTerm', () => {
  const t = (surface: string, reading: string, pos = '名詞') => ({ surface, reading, pos, base: surface, posDetail: '' });

  it('joins token readings with spaces, the way release groups write titles', () => {
    expect(romajiSearchTerm([
      t('孤独', 'こどく'), t('の', 'の', '助詞'), t('グルメ', 'ぐるめ'),
    ])).toBe('kodoku no gurume');
  });

  it('spells the particles は / へ / を the way they are pronounced', () => {
    expect(romajiSearchTerm([
      t('逃げる', 'にげる', '動詞'), t('は', 'は', '助詞'), t('恥', 'はじ'),
    ])).toBe('nigeru wa haji');
    expect(romajiSearchTerm([t('海', 'うみ'), t('へ', 'へ', '助詞')])).toBe('umi e');
    expect(romajiSearchTerm([t('本', 'ほん'), t('を', 'を', '助詞')])).toBe('hon o');
  });

  it('keeps は as ha when it is part of a word, not a particle', () => {
    expect(romajiSearchTerm([t('恥', 'はじ')])).toBe('haji');
  });

  it('passes latin tokens through untouched', () => {
    expect(romajiSearchTerm([t('MIU', 'MIU'), t('404', '404')])).toBe('MIU 404');
  });

  it('drops punctuation tokens so they do not become empty terms', () => {
    expect(romajiSearchTerm([
      t('きのう', 'きのう'), t('何', 'なに'), t('食べ', 'たべ'), t('た', 'た', '助動詞'), t('？', '？', '記号'),
    ])).toBe('kinou nani tabe ta');
  });
});
