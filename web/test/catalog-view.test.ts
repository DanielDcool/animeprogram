import { describe, expect, it } from 'vitest';
import { scoreLabel, seasonLabel, statusLabel } from '../src/catalog/view';

describe('catalog view labels', () => {
  it('shows quarterly Japanese release labels', () => {
    expect(seasonLabel({ year: 2026, season: 'SUMMER' })).toBe('2026年 7月新番');
    expect(seasonLabel({ year: 2026, season: 'SPRING' })).toBe('2026年 4月新番');
  });

  it('maps release state and missing scores to readable text', () => {
    expect(statusLabel('RELEASING')).toBe('放送中');
    expect(statusLabel('FINISHED')).toBe('放送終了');
    expect(statusLabel('NOT_YET_RELEASED')).toBe('放送予定');
    expect(statusLabel('CANCELLED')).toBe('配信情報を確認');
    expect(scoreLabel(null)).toBe('評価なし');
    expect(scoreLabel(86)).toBe('86%');
  });
});
