export type SubtitleStatus = 'ready' | 'needs_mapping' | 'downloading' | 'failed';

export interface MediaItem {
  id: number;
  folder: string;
  series: string;
  episode: number | null;
  codecStatus: string;
  playable: boolean;
  hasSubtitle: boolean;
  positionSec: number;
  subtitleStatus: SubtitleStatus;
  subtitleError: string | null;
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
export interface VocabDetail extends VocabItem {
  aiExplanation: Explanation | null;
}
export interface AnkiExportResult {
  deck: string;
  added: number;
  skipped: number;
  total: number;
}

export type SeasonName = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
export interface SeasonRef { year: number; season: SeasonName }
export interface CatalogLink { site: string; url: string; type: 'STREAMING' | 'INFO' }
export interface CatalogAnime {
  id: number;
  title: string;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  description: string;
  genres: string[];
  score: number | null;
  popularity: number;
  episodes: number | null;
  status: string;
  format: string | null;
  startDate: string | null;
  studio: string | null;
  links: CatalogLink[];
  recommendation?: { badge: string; reason: string };
}
export interface CatalogSeason extends SeasonRef { items: CatalogAnime[] }
export interface CatalogHome {
  current: CatalogSeason;
  previous: CatalogSeason;
  featured: CatalogAnime[];
}

export type DramaLevel = 'N3' | 'N2' | 'N1' | 'N1+';
/** 厳選（TMDB id）と Bangumi 検索結果（subject id）は id の名前空間が違う */
export type DramaSource = 'editorial' | 'bangumi';
export interface CatalogDrama {
  id: number;
  source: DramaSource;
  title: string;
  titleRomaji: string | null;
  titleAliases: string[];
  coverImage: string | null;
  bannerImage: string | null;
  startDate: string | null;
  description: string | null;
  /** 0–10（Bangumi）。厳選は null */
  score: number | null;
  episodes: number | null;
  network: string | null;
  /** 厳選由来。検索結果でも同名の厳選があれば載る */
  level?: DramaLevel;
  recommendation?: { badge: string; reason: string };
}
export interface DramaHome {
  hero: CatalogDrama;
  picks: CatalogDrama[];
}

export type ResourceCategory = 'english' | 'raw' | 'all';
export interface ResourceResult {
  id: string;
  title: string;
  detailUrl: string;
  magnet: string;
  size: string;
  sizeBytes: number | null;
  seeders: number;
  leechers: number;
  downloads: number;
  publishedAt: string | null;
  trusted: boolean;
  remake: boolean;
  category: string;
  releaseGroup: string | null;
  resolution: '2160p' | '1080p' | '720p' | 'other' | null;
  codec: 'H.264' | 'H.265' | 'AV1' | 'unknown';
  needsTranscode: boolean;
}
export interface ResourceSearchResponse {
  items: ResourceResult[];
  query: string;
  category: ResourceCategory;
  externalSearchUrl: string;
}
