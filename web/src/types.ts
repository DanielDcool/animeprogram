export interface MediaItem {
  id: number;
  series: string;
  episode: number | null;
  codecStatus: string;
  playable: boolean;
  hasSubtitle: boolean;
  positionSec: number;
}
export interface Cue { start: number; end: number; text: string }
export interface SubtitleData { offsetMs: number; cues: Cue[] }
export interface Gloss { word: string; kana: string; gloss: string }
export interface Token {
  surface: string; base: string; reading: string; pos: string; posDetail: string; glosses: Gloss[];
}
export interface VocabItem {
  id: number;
  kind: 'word' | 'sentence';
  word: string | null;
  reading: string | null;
  gloss: string | null;
  sentence: string;
  translation: string | null;
  positionSec: number | null;
  createdAt: string;
  series: string | null;
  episode: number | null;
  mediaId: number | null;
}
export interface Explanation {
  translation: string; structure: string;
  expressions: { expression: string; meaning: string }[];
  nuance: string;
}
