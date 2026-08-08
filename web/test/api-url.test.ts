import { describe, expect, it } from 'vitest';
import { joinApiBase } from '../src/api.js';

describe('joinApiBase', () => {
  it('keeps same-origin API paths by default', () => {
    expect(joinApiBase('/api/health', '')).toBe('/api/health');
  });

  it('joins an explicitly configured remote API origin without duplicate slashes', () => {
    expect(joinApiBase('/api/health', 'https://api.example.test/')).toBe('https://api.example.test/api/health');
  });
});
