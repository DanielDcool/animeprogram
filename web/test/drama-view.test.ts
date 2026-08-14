import { describe, expect, it } from 'vitest';
import { airYearLabel, courLabel, networkLabel } from '../src/drama/view';

describe('courLabel', () => {
  it('uses the japanese drama cour convention, not the anime one', () => {
    expect(courLabel({ year: 2026, season: 'SUMMER' })).toBe('2026年 7月期');
    expect(courLabel({ year: 2026, season: 'WINTER' })).toBe('2026年 1月期');
    expect(courLabel({ year: 2025, season: 'FALL' })).toBe('2025年 10月期');
  });
});

describe('networkLabel', () => {
  it('falls back when the network is unknown', () => {
    expect(networkLabel('TBS')).toBe('TBS');
    expect(networkLabel(null)).toBe('放送局不明');
  });
});

describe('airYearLabel', () => {
  it('shows only the year from an iso date', () => {
    expect(airYearLabel('2022-10-06')).toBe('2022年');
    expect(airYearLabel(null)).toBe('');
    expect(airYearLabel('bogus')).toBe('');
  });
});
