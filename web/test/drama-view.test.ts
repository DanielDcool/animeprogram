import { describe, expect, it } from 'vitest';
import { airYearLabel, dramaCardMeta, dramaDetailPath, dramaScoreLabel } from '../src/drama/view';
import type { CatalogDrama } from '../src/types';

function drama(overrides: Partial<CatalogDrama> = {}): CatalogDrama {
  return {
    id: 225581,
    source: 'bangumi',
    title: 'アンナチュラル',
    titleRomaji: 'UNNATURAL',
    titleAliases: ['UNNATURAL'],
    coverImage: null,
    bannerImage: null,
    startDate: '2018-01-12',
    description: null,
    score: 8.4,
    episodes: 10,
    network: 'TBSテレビ',
    ...overrides,
  };
}

describe('airYearLabel', () => {
  it('shows only the year from an iso date', () => {
    expect(airYearLabel('2022-10-06')).toBe('2022年');
    expect(airYearLabel(null)).toBe('');
    expect(airYearLabel('bogus')).toBe('');
  });
});

describe('dramaScoreLabel', () => {
  it('formats a bangumi 0–10 score with one decimal', () => {
    expect(dramaScoreLabel(8.4)).toBe('8.4');
    expect(dramaScoreLabel(9)).toBe('9.0');
  });

  it('says there is no rating instead of showing 0', () => {
    expect(dramaScoreLabel(null)).toBe('評価なし');
    expect(dramaScoreLabel(0)).toBe('評価なし');
  });
});

describe('dramaCardMeta', () => {
  it('joins year, episode count and network, skipping what is missing', () => {
    expect(dramaCardMeta(drama())).toBe('2018年 · 10話 · TBSテレビ');
    expect(dramaCardMeta(drama({ episodes: null }))).toBe('2018年 · TBSテレビ');
    expect(dramaCardMeta(drama({ startDate: null, episodes: null, network: null }))).toBe('');
  });
});

describe('dramaDetailPath', () => {
  it('routes bangumi subjects under their own prefix and picks under /drama', () => {
    expect(dramaDetailPath(drama())).toBe('/drama/bgm/225581');
    expect(dramaDetailPath(drama({ source: 'editorial', id: 92783 }))).toBe('/drama/92783');
  });
});
