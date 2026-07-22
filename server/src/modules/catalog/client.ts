import { editorialNote, editorialRank, type EditorialNote } from './editorial.js';

export type SeasonName = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface SeasonRef {
  year: number;
  season: SeasonName;
}

export interface CatalogLink {
  site: string;
  url: string;
  type: 'STREAMING' | 'INFO';
}

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
  recommendation?: EditorialNote;
}

export interface CatalogSeason extends SeasonRef {
  items: CatalogAnime[];
}

export interface CatalogHome {
  current: CatalogSeason;
  previous: CatalogSeason;
  featured: CatalogAnime[];
}

export interface CatalogClient {
  home(): Promise<CatalogHome>;
  search(query: string): Promise<CatalogAnime[]>;
  detail(id: number): Promise<CatalogAnime | null>;
}

export type AniListFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class CatalogUpstreamError extends Error {
  constructor(message = 'Anime catalog is unavailable') {
    super(message);
    this.name = 'CatalogUpstreamError';
  }
}

interface AniListMedia {
  id: number;
  title?: { native?: string | null; romaji?: string | null; english?: string | null } | null;
  coverImage?: { extraLarge?: string | null } | null;
  bannerImage?: string | null;
  description?: string | null;
  genres?: string[] | null;
  averageScore?: number | null;
  popularity?: number | null;
  episodes?: number | null;
  status?: string | null;
  format?: string | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  studios?: { nodes?: Array<{ name?: string | null }> | null } | null;
  externalLinks?: Array<{ site?: string | null; url?: string | null; type?: string | null }> | null;
}

const ANILIST_URL = 'https://graphql.anilist.co';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MEDIA_FIELDS = `
  id
  title { native romaji english }
  coverImage { extraLarge }
  bannerImage
  description
  genres
  averageScore
  popularity
  episodes
  status
  format
  startDate { year month day }
  studios(isMain: true) { nodes { name } }
  externalLinks { site url type }
`;

const SEASONS: SeasonName[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

export function getSeasonPair(now = new Date()): { current: SeasonRef; previous: SeasonRef } {
  const year = now.getFullYear();
  const index = Math.floor(now.getMonth() / 3);
  const previousIndex = (index + 3) % 4;
  return {
    current: { year, season: SEASONS[index] },
    previous: { year: index === 0 ? year - 1 : year, season: SEASONS[previousIndex] },
  };
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", '#39': "'", lt: '<', gt: '>', nbsp: ' ',
  };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

export function cleanDescription(value: string | null | undefined): string {
  if (!value) return '';
  return decodeEntities(value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function dateString(value: AniListMedia['startDate']): string | null {
  if (!value?.year || !value.month || !value.day) return null;
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function normalizeMedia(media: AniListMedia): CatalogAnime {
  const titleNative = media.title?.native ?? null;
  const titleRomaji = media.title?.romaji ?? titleNative ?? `Anime ${media.id}`;
  const links = (media.externalLinks ?? []).flatMap<CatalogLink>((link) => {
    if ((link.type !== 'STREAMING' && link.type !== 'INFO') || !link.url?.startsWith('https://')) return [];
    return [{ site: link.site ?? 'Official', url: link.url, type: link.type }];
  });
  const recommendation = editorialNote(media.id);
  return {
    id: media.id,
    title: titleNative ?? titleRomaji,
    titleRomaji,
    titleEnglish: media.title?.english ?? null,
    titleNative,
    coverImage: media.coverImage?.extraLarge ?? null,
    bannerImage: media.bannerImage ?? null,
    description: cleanDescription(media.description),
    genres: media.genres ?? [],
    score: media.averageScore ?? null,
    popularity: media.popularity ?? 0,
    episodes: media.episodes ?? null,
    status: media.status ?? 'UNKNOWN',
    format: media.format ?? null,
    startDate: dateString(media.startDate),
    studio: media.studios?.nodes?.find((studio) => studio.name)?.name ?? null,
    links,
    ...(recommendation ? { recommendation } : {}),
  };
}

export function createAniListCatalog(
  fetchImpl: AniListFetch = fetch,
  now: () => Date = () => new Date(),
): CatalogClient {
  const cache = new Map<string, { expiresAt: number; value: unknown }>();

  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const value = await load();
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(ANILIST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      throw new CatalogUpstreamError(error instanceof Error ? error.message : undefined);
    }
    if (!response.ok) throw new CatalogUpstreamError(`AniList returned ${response.status}`);
    try {
      const body = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
      if (body.errors?.length || body.data == null) {
        throw new CatalogUpstreamError(body.errors?.[0]?.message);
      }
      return body.data;
    } catch (error) {
      if (error instanceof CatalogUpstreamError) throw error;
      throw new CatalogUpstreamError('AniList returned invalid JSON');
    }
  }

  async function season(ref: SeasonRef): Promise<CatalogSeason> {
    return cached(`season:${ref.year}:${ref.season}`, async () => {
      const data = await request<{ Page?: { media?: AniListMedia[] | null } }>(`
        query Season($season: MediaSeason, $year: Int, $perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(type: ANIME, season: $season, seasonYear: $year, isAdult: false, sort: [POPULARITY_DESC]) {
              ${MEDIA_FIELDS}
            }
          }
        }
      `, { season: ref.season, year: ref.year, perPage: 20 });
      return { ...ref, items: (data.Page?.media ?? []).map(normalizeMedia) };
    });
  }

  return {
    async home() {
      const refs = getSeasonPair(now());
      const [current, previous] = await Promise.all([season(refs.current), season(refs.previous)]);
      const featured = current.items
        .filter((item) => item.recommendation)
        .sort((a, b) => editorialRank(a.id) - editorialRank(b.id))
        .slice(0, 3);
      return { current, previous, featured: featured.length ? featured : current.items.slice(0, 3) };
    },

    async search(query: string) {
      const search = query.trim();
      return cached(`search:${search.toLocaleLowerCase()}`, async () => {
        const data = await request<{ Page?: { media?: AniListMedia[] | null } }>(`
          query Search($search: String, $perPage: Int) {
            Page(page: 1, perPage: $perPage) {
              media(type: ANIME, search: $search, isAdult: false, sort: [SEARCH_MATCH]) {
                ${MEDIA_FIELDS}
              }
            }
          }
        `, { search, perPage: 20 });
        return (data.Page?.media ?? []).map(normalizeMedia);
      });
    },

    async detail(id: number) {
      return cached(`detail:${id}`, async () => {
        const data = await request<{ Media?: AniListMedia | null }>(`
          query Detail($id: Int) {
            Media(id: $id, type: ANIME, isAdult: false) {
              ${MEDIA_FIELDS}
            }
          }
        `, { id });
        return data.Media ? normalizeMedia(data.Media) : null;
      });
    },
  };
}
