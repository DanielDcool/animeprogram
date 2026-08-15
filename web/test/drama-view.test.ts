import { describe, expect, it } from 'vitest';
import { airYearLabel } from '../src/drama/view';

describe('airYearLabel', () => {
  it('shows only the year from an iso date', () => {
    expect(airYearLabel('2022-10-06')).toBe('2022年');
    expect(airYearLabel(null)).toBe('');
    expect(airYearLabel('bogus')).toBe('');
  });
});
