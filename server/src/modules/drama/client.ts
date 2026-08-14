import { cleanDescription, getSeasonPair, type SeasonRef } from '../catalog/client.js';
import { dramaEditorialNote, type DramaEditorialNote } from './editorial.js';

export interface DramaLink {
  site: string;
  url: string;
  type: 'STREAMING' | 'INFO';
}

export interface CatalogDrama {
  id: number;
  title: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  description: string;
  score: number | null;
  episodes: number | null;
  status: string;
  startDate: string | null;
  network: string | null;
  links: DramaLink[];
  recommendation?: DramaEditorialNote;
}

export interface DramaSeason extends SeasonRef {
  items: CatalogDrama[];
}

export interface DramaHome {
  current: DramaSeason;
  previous: DramaSeason;
  featured: CatalogDrama[];
  tmdbConfigured: boolean;
}

export interface DramaCatalogClient {
  home(): Promise<DramaHome>;
  search(query: string): Promise<CatalogDrama[]>;
  detail(id: number): Promise<CatalogDrama | null>;
}

export type TmdbFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class DramaUpstreamError extends Error {
  constructor(message = 'Drama catalog is unavailable') {
    super(message);
    this.name = 'DramaUpstreamError';
  }
}

const TMDB_ORIGIN = 'https://api.themoviedb.org';
const IMAGE_ORIGIN = 'https://image.tmdb.org/t/p';
const CACHE_TTL_MS = 10 * 60 * 1000;
const PER_PAGE = 20;

interface TmdbTv {
  id: number;
  name?: string | null;
  original_name?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  first_air_date?: string | null;
  number_of_episodes?: number | null;
  status?: string | null;
  homepage?: string | null;
  networks?: Array<{ name?: string | null }> | null;
  'watch/providers'?: { results?: Record<string, { link?: string | null } | undefined> | null } | null;
}

const QUARTER_RANGE = {
  WINTER: ['01-01', '03-31'],
  SPRING: ['04-01', '06-30'],
  SUMMER: ['07-01', '09-30'],
  FALL: ['10-01', '12-31'],
} as const;

/** クール（1月期/4月期/7月期/10月期）は自然四半期と一致するので、季度定義はアニメと共用できる */
export function seasonDateRange(ref: SeasonRef): { gte: string; lte: string } {
  const [from, to] = QUARTER_RANGE[ref.season];
  return { gte: `${ref.year}-${from}`, lte: `${ref.year}-${to}` };
}

/** 既存の statusLabel() をそのまま使えるよう AniList 語彙へ寄せる */
function normalizeStatus(value: string | null | undefined): string {
  if (value === 'Returning Series' || value === 'In Production') return 'RELEASING';
  if (value === 'Ended' || value === 'Canceled') return 'FINISHED';
  if (value === 'Planned') return 'NOT_YET_RELEASED';
  return 'UNKNOWN';
}

function imageUrl(path: string | null | undefined, size: 'w500' | 'w1280'): string | null {
  return path ? `${IMAGE_ORIGIN}/${size}${path}` : null;
}

function httpsLink(site: string, url: string | null | undefined, type: DramaLink['type']): DramaLink[] {
  return url?.startsWith('https://') ? [{ site, url, type }] : [];
}

function normalizeTv(tv: TmdbTv): CatalogDrama {
  const titleNative = tv.original_name ?? null;
  const titleEnglish = tv.name ?? null;
  const watchLink = tv['watch/providers']?.results?.JP?.link ?? null;
  const recommendation = dramaEditorialNote(tv.id);
  return {
    id: tv.id,
    title: titleNative ?? titleEnglish ?? `Drama ${tv.id}`,
    titleEnglish,
    titleNative,
    coverImage: imageUrl(tv.poster_path, 'w500'),
    bannerImage: imageUrl(tv.backdrop_path, 'w1280'),
    description: cleanDescription(tv.overview),
    score: tv.vote_average ? Math.round(tv.vote_average * 10) : null,
    episodes: tv.number_of_episodes ?? null,
    status: normalizeStatus(tv.status),
    startDate: tv.first_air_date || null,
    network: tv.networks?.find((n) => n.name)?.name ?? null,
    links: [
      ...httpsLink('配信を探す（TMDB）', watchLink, 'STREAMING'),
      ...httpsLink('公式サイト', tv.homepage, 'INFO'),
    ],
    ...(recommendation ? { recommendation } : {}),
  };
}

export function createTmdbDramaCatalog(
  token: string,
  fetchImpl: TmdbFetch = fetch,
  now: () => Date = () => new Date(),
): DramaCatalogClient {
  const cache = new Map<string, { expiresAt: number; value: unknown }>();

  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const value = await load();
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const url = new URL(path, TMDB_ORIGIN);
    url.search = new URLSearchParams({ language: 'ja-JP', ...params }).toString();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new DramaUpstreamError(error instanceof Error ? error.message : undefined);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new DramaUpstreamError(`TMDB returned ${response.status}`);
    try {
      return await response.json() as T;
    } catch {
      throw new DramaUpstreamError('TMDB returned invalid JSON');
    }
  }

  async function discover(ref: SeasonRef): Promise<DramaSeason> {
    return cached(`season:${ref.year}:${ref.season}`, async () => {
      const range = seasonDateRange(ref);
      const data = await get<{ results?: TmdbTv[] | null }>('/3/discover/tv', {
        with_original_language: 'ja',
        sort_by: 'popularity.desc',
        include_adult: 'false',
        page: '1',
        'first_air_date.gte': range.gte,
        'first_air_date.lte': range.lte,
      });
      return { ...ref, items: (data?.results ?? []).slice(0, PER_PAGE).map(normalizeTv) };
    });
  }

  return {
    async home() {
      const refs = getSeasonPair(now());
      const [current, previous] = await Promise.all([discover(refs.current), discover(refs.previous)]);
      return { current, previous, featured: [], tmdbConfigured: true };
    },

    async search(query: string) {
      const search = query.trim();
      return cached(`search:${search.toLocaleLowerCase()}`, async () => {
        const data = await get<{ results?: TmdbTv[] | null }>('/3/search/tv', {
          query: search,
          include_adult: 'false',
          page: '1',
        });
        return (data?.results ?? []).slice(0, PER_PAGE).map(normalizeTv);
      });
    },

    async detail(id: number) {
      return cached(`detail:${id}`, async () => {
        const tv = await get<TmdbTv>(`/3/tv/${id}`, { append_to_response: 'watch/providers' });
        return tv ? normalizeTv(tv) : null;
      });
    },
  };
}
