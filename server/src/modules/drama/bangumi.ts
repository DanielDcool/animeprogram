import { readFileSync } from 'node:fs';
import { dramaEditorialByTitle, type CatalogDrama } from './editorial.js';

/**
 * Bangumi（bgm.tv）を検索窓の作品カタログにする。
 * トークン不要で、日本語の原題で引けて、ポスター・評価・あらすじ（多くは公式の日本語文）が取れる。
 * TMDB は利用者にトークン登録を求めるため 2026-08-15 に外した（docs/DEVELOPMENT.md §4）。
 * 取ってきたものは 10 分だけプロセス内に置く。リポジトリにも SQLite にも写さない。
 */

export interface DramaCatalogClient {
  search(query: string): Promise<CatalogDrama[]>;
  /** 見つからない・実写の日本ドラマでない → null */
  detail(id: number): Promise<CatalogDrama | null>;
}

export class DramaUpstreamError extends Error {
  constructor(message = 'Drama catalog is unavailable') {
    super(message);
    this.name = 'DramaUpstreamError';
  }
}

export type BangumiFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const API_BASE = 'https://api.bgm.tv';
const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 20;
/** Bangumi の subject type: 6 = 三次元（実写）。ここに日本ドラマ・映画・バラエティ・韓国ドラマが混ざる */
const SUBJECT_TYPE_REAL = 6;
/** type=6 の中で日本のテレビドラマだけを残すための platform 値 */
const PLATFORM_JDRAMA = '日剧';

function readAppVersion(): string {
  try {
    const raw = readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Bangumi API は識別できる User-Agent を要求する（アプリ名/バージョン + 連絡先） */
export const DEFAULT_USER_AGENT = `tanku-anime/${readAppVersion()} (https://github.com/DanielDcool/tankuanime)`;

interface BangumiInfoboxItem {
  key?: string;
  value?: string | Array<{ v?: string; k?: string }> | null;
}

interface BangumiSubject {
  id: number;
  type?: number;
  name?: string | null;
  name_cn?: string | null;
  date?: string | null;
  platform?: string | null;
  summary?: string | null;
  nsfw?: boolean;
  eps?: number | null;
  images?: { large?: string | null; common?: string | null } | null;
  rating?: { score?: number | null; total?: number | null } | null;
  infobox?: BangumiInfoboxItem[] | null;
}

function infoboxValues(subject: BangumiSubject, key: string): string[] {
  const item = subject.infobox?.find((entry) => entry.key === key);
  if (!item?.value) return [];
  const raw = typeof item.value === 'string'
    ? [item.value]
    : item.value.map((entry) => entry?.v ?? '');
  return raw.map((value) => value.trim()).filter(Boolean);
}

/** リソース検索に使えるのはラテン文字の別名だけ（中国語題や仮名表記は Nyaa で当たらない） */
function isLatin(value: string): boolean {
  return /^[\x20-\x7e]+$/.test(value);
}

function isJapaneseDrama(subject: BangumiSubject): boolean {
  return subject.type === SUBJECT_TYPE_REAL && subject.platform === PLATFORM_JDRAMA && subject.nsfw !== true;
}

function normalize(subject: BangumiSubject): CatalogDrama {
  const title = subject.name?.trim() || subject.name_cn?.trim() || `Drama ${subject.id}`;
  const aliases = [...new Set(infoboxValues(subject, '别名').filter(isLatin))];
  const editorial = dramaEditorialByTitle(title);
  const description = subject.summary?.replace(/\r\n?/g, '\n').trim() || null;
  const score = subject.rating?.score && subject.rating?.total ? subject.rating.score : null;
  return {
    id: subject.id,
    source: 'bangumi',
    title,
    titleRomaji: aliases[0] ?? editorial?.titleRomaji ?? null,
    titleAliases: aliases,
    coverImage: subject.images?.large || subject.images?.common || null,
    bannerImage: null,
    startDate: subject.date || null,
    description,
    score,
    episodes: subject.eps || null,
    network: infoboxValues(subject, '电视台')[0] ?? null,
    ...(editorial ? { level: editorial.level, recommendation: editorial.recommendation } : {}),
  };
}

export function createBangumiCatalog(
  fetchImpl: BangumiFetch = fetch,
  options: { userAgent?: string } = {},
): DramaCatalogClient {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const cache = new Map<string, { expiresAt: number; value: unknown }>();

  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const value = await load();
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  /** 404 は「無い」として null。それ以外の失敗は全部 DramaUpstreamError に寄せる */
  async function request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    let response: Response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        ...init,
        headers: {
          accept: 'application/json',
          'user-agent': userAgent,
          ...(init.body != null ? { 'content-type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new DramaUpstreamError(error instanceof Error ? error.message : undefined);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new DramaUpstreamError(`Bangumi returned ${response.status}`);
    try {
      return await response.json() as T;
    } catch {
      throw new DramaUpstreamError('Bangumi returned invalid JSON');
    }
  }

  return {
    async search(query) {
      const keyword = query.trim();
      return cached(`search:${keyword.toLocaleLowerCase()}`, async () => {
        const body = await request<{ data?: BangumiSubject[] | null }>(`/v0/search/subjects?limit=${PAGE_SIZE}`, {
          method: 'POST',
          body: JSON.stringify({ keyword, filter: { type: [SUBJECT_TYPE_REAL] } }),
        });
        return (body?.data ?? []).filter(isJapaneseDrama).map(normalize);
      });
    },

    async detail(id) {
      return cached(`detail:${id}`, async () => {
        const subject = await request<BangumiSubject>(`/v0/subjects/${id}`);
        return subject && isJapaneseDrama(subject) ? normalize(subject) : null;
      });
    },
  };
}
