import type { Cue } from '../types';

export interface LearnState {
  paused: boolean;
  revealed: boolean;  // 一時停止中に現在の句を表示
  alwaysOn: boolean;  // 通常視聴モード：字幕常時表示
}

export const initialState: LearnState = { paused: false, revealed: false, alwaysOn: false };

export type LearnAction =
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'REPLAY'; cueStart: number | null }
  | { type: 'JUMP'; cueStart: number | null }
  | { type: 'SELECT'; cueStart: number | null }   // 字幕一覧クリック：ジャンプ+一時停止+表示
  | { type: 'TOGGLE_ALWAYS_ON' }
  | { type: 'EXTERNAL_PLAY' }    // ネイティブコントロール操作
  | { type: 'EXTERNAL_PAUSE' };

export type Effect = { type: 'pause' } | { type: 'play' } | { type: 'seek'; time: number };

export function reduce(state: LearnState, action: LearnAction): { state: LearnState; effects: Effect[] } {
  switch (action.type) {
    case 'TOGGLE_PAUSE':
      return state.paused
        ? { state: { ...state, paused: false, revealed: false }, effects: [{ type: 'play' }] }
        : { state: { ...state, paused: true, revealed: true }, effects: [{ type: 'pause' }] };
    case 'REPLAY':
      if (action.cueStart == null) return { state, effects: [] };
      return {
        state: { ...state, paused: false, revealed: false },
        effects: [{ type: 'seek', time: action.cueStart }, { type: 'play' }],
      };
    case 'JUMP':
      if (action.cueStart == null) return { state, effects: [] };
      return { state, effects: [{ type: 'seek', time: action.cueStart }] };
    case 'SELECT':
      if (action.cueStart == null) return { state, effects: [] };
      return {
        state: { ...state, paused: true, revealed: true },
        effects: [{ type: 'seek', time: action.cueStart }, { type: 'pause' }],
      };
    case 'TOGGLE_ALWAYS_ON':
      return { state: { ...state, alwaysOn: !state.alwaysOn }, effects: [] };
    case 'EXTERNAL_PLAY':
      return { state: { ...state, paused: false, revealed: false }, effects: [] };
    case 'EXTERNAL_PAUSE':
      return { state: { ...state, paused: true, revealed: true }, effects: [] };
  }
}

/** 現在時刻に対応する句のインデックス：句中はその句、間隙は直前の句、最初の句より前は -1 */
export function currentCueIndex(cues: Cue[], time: number): number {
  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].start <= time) idx = i;
    else break;
  }
  return idx;
}
