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
}

export interface ResourceSearchOptions {
  season?: number;
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
