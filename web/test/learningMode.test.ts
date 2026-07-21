import { describe, it, expect } from 'vitest';
import { initialState, reduce, currentCueIndex, type LearnState } from '../src/player/learningMode';
import type { Cue } from '../src/types';

const cues: Cue[] = [
  { start: 1, end: 3, text: '一句目' },
  { start: 5, end: 8, text: '二句目' },
];

describe('currentCueIndex', () => {
  it('finds active cue, or the previous one during gaps', () => {
    expect(currentCueIndex(cues, 2)).toBe(0);      // 句中
    expect(currentCueIndex(cues, 4)).toBe(0);      // 間隙 → 直前の句
    expect(currentCueIndex(cues, 6)).toBe(1);
    expect(currentCueIndex(cues, 0.5)).toBe(-1);   // 最初の句より前
  });
});

describe('reduce', () => {
  it('TOGGLE_PAUSE while playing: pauses and reveals', () => {
    const { state, effects } = reduce(initialState, { type: 'TOGGLE_PAUSE' });
    expect(state.paused).toBe(true);
    expect(state.revealed).toBe(true);
    expect(effects).toEqual([{ type: 'pause' }]);
  });

  it('TOGGLE_PAUSE while paused: resumes and hides subtitle', () => {
    const paused: LearnState = { ...initialState, paused: true, revealed: true };
    const { state, effects } = reduce(paused, { type: 'TOGGLE_PAUSE' });
    expect(state.paused).toBe(false);
    expect(state.revealed).toBe(false);
    expect(effects).toEqual([{ type: 'play' }]);
  });

  it('REPLAY seeks to cue start and plays without revealing', () => {
    const paused: LearnState = { ...initialState, paused: true, revealed: true };
    const { state, effects } = reduce(paused, { type: 'REPLAY', cueStart: 5 });
    expect(state.revealed).toBe(false);
    expect(state.paused).toBe(false);
    expect(effects).toEqual([{ type: 'seek', time: 5 }, { type: 'play' }]);
  });

  it('REPLAY with no cue does nothing', () => {
    const { state, effects } = reduce(initialState, { type: 'REPLAY', cueStart: null });
    expect(effects).toEqual([]);
    expect(state).toEqual(initialState);
  });

  it('JUMP seeks to given cue start, keeps hidden', () => {
    const { effects } = reduce(initialState, { type: 'JUMP', cueStart: 1 });
    expect(effects).toEqual([{ type: 'seek', time: 1 }]);
  });

  it('TOGGLE_ALWAYS_ON flips subtitle-always-visible mode', () => {
    const { state } = reduce(initialState, { type: 'TOGGLE_ALWAYS_ON' });
    expect(state.alwaysOn).toBe(true);
    const back = reduce(state, { type: 'TOGGLE_ALWAYS_ON' });
    expect(back.state.alwaysOn).toBe(false);
  });

  it('subtitle hidden by default', () => {
    expect(initialState.alwaysOn || initialState.revealed).toBe(false);
  });
});
