import { describe, it, expect } from 'vitest';
import { formatClock, seekTimeFromFraction, progressFraction } from '../src/player/playerControls';

describe('formatClock', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(1439)).toBe('23:59');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('handles missing / non-finite input as 0:00', () => {
    expect(formatClock(NaN)).toBe('0:00');
    expect(formatClock(Infinity)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('seekTimeFromFraction', () => {
  it('maps 0..1 onto 0..duration', () => {
    expect(seekTimeFromFraction(0, 100)).toBe(0);
    expect(seekTimeFromFraction(0.5, 100)).toBe(50);
    expect(seekTimeFromFraction(1, 100)).toBe(100);
  });

  it('clamps out-of-range fractions and bad duration', () => {
    expect(seekTimeFromFraction(-1, 100)).toBe(0);
    expect(seekTimeFromFraction(2, 100)).toBe(100);
    expect(seekTimeFromFraction(0.5, 0)).toBe(0);
    expect(seekTimeFromFraction(0.5, NaN)).toBe(0);
  });
});

describe('progressFraction', () => {
  it('returns current/duration clamped to 0..1', () => {
    expect(progressFraction(0, 100)).toBe(0);
    expect(progressFraction(25, 100)).toBe(0.25);
    expect(progressFraction(150, 100)).toBe(1);
  });

  it('returns 0 when duration unknown', () => {
    expect(progressFraction(10, 0)).toBe(0);
    expect(progressFraction(10, NaN)).toBe(0);
    expect(progressFraction(10, Infinity)).toBe(0);
  });
});
