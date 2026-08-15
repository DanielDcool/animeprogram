export type ResourceCategory = 'english' | 'raw' | 'all';

/** 検索対象の種類。Nyaa のカテゴリ体系が異なるため型で区別する */
export type ContentKind = 'anime' | 'drama';

// Nyaa のカテゴリ ID。アニメと実写は並行採番ではないので個別に持つ。
//   アニメ:  1_1 AMV / 1_2 English / 1_3 Non-English / 1_4 Raw
//   実写:    4_1 English / 4_2 Non-English / 4_3 Idol・PV / 4_4 Raw
// 「1 を 4 に置換」すると英語字幕が 4_2 になり、アイドル PV や別物を掴む。
const NYAA_CATEGORY_IDS: Record<ContentKind, Record<ResourceCategory, string>> = {
  anime: { all: '1_0', english: '1_2', raw: '1_4' },
  drama: { all: '4_0', english: '4_1', raw: '4_4' },
};

export function nyaaCategoryId(kind: ContentKind, category: ResourceCategory): string {
  return NYAA_CATEGORY_IDS[kind][category];
}

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
}

export interface ResourceSearchOptions {
  season?: number;
  kind?: ContentKind;
}

export interface ResourceProvider {
  search(
    queries: string[],
    category: ResourceCategory,
    options?: ResourceSearchOptions,
  ): Promise<ResourceSearchResponse>;
}

export class ResourceUpstreamError extends Error {
  constructor(message = 'Anime resource provider is unavailable') {
    super(message);
    this.name = 'ResourceUpstreamError';
  }
}
