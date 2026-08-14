import {
  ResourceUpstreamError,
  nyaaCategoryId,
  type ContentKind,
  type ResourceCategory,
  type ResourceProvider,
  type ResourceResult,
  type ResourceSearchOptions,
} from './provider.js';
import { matchesResourceSeason } from './season.js';

type ResourceFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const NYAA_ORIGIN = 'https://nyaa.si';
const CACHE_TTL_MS = 5 * 60 * 1000;

function decodeXml(value: string): string {
  const withoutCdata = value.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
  const named: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  };
  return withoutCdata.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.toLowerCase().startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  }).trim();
}

function readTag(block: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseCount(value: string): number {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function parseSizeBytes(value: string): number | null {
  const match = value.match(/^([\d.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)$/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  const binary = match[2].toLowerCase().includes('i');
  const unit = match[2][0].toUpperCase();
  const power = { B: 0, K: 1, M: 2, G: 3, T: 4 }[unit];
  if (power == null) return null;
  return Math.round(amount * (binary ? 1024 : 1000) ** power);
}

function parsePublishedAt(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function releaseGroup(title: string): string | null {
  const match = title.match(/^\s*\[([^\]]+)]/);
  if (!match) return null;
  return /^(?:\d{3,4}p|h\.?26[45]|x26[45]|hevc|av1|web-?dl)$/i.test(match[1]) ? null : match[1];
}

function resolution(title: string): ResourceResult['resolution'] {
  if (/\b2160p\b/i.test(title)) return '2160p';
  if (/\b1080p\b/i.test(title)) return '1080p';
  if (/\b720p\b/i.test(title)) return '720p';
  return /\b\d{3,4}p\b/i.test(title) ? 'other' : null;
}

function codec(title: string): ResourceResult['codec'] {
  if (/\bav1\b/i.test(title)) return 'AV1';
  if (/\b(?:h[ ._-]?265|x265|hevc)\b/i.test(title)) return 'H.265';
  if (/\b(?:h[ ._-]?264|x264|avc)\b/i.test(title)) return 'H.264';
  return 'unknown';
}

function safeDetailUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== NYAA_ORIGIN || !/^\/view\/\d+$/.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function buildMagnet(infoHash: string, title: string): string | null {
  if (!/^(?:[a-f\d]{40}|[a-z2-7]{32})$/i.test(infoHash)) return null;
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`;
}

function releaseScopeScore(title: string): number {
  if (
    /\b(?:batch|complete)\b/i.test(title)
    || /\bseason\s*\d{1,2}\b/i.test(title)
    || /\bS\d{1,2}\b/i.test(title)
    || /(?:^|[\s[(])\d{1,3}\s*[-~～]\s*\d{1,3}(?=$|[\s)\]])/.test(title)
    || /\bpart\s*1\s*\+\s*part\s*2\b/i.test(title)
  ) return 2;
  if (
    /\bS\d{1,2}E\d{1,3}\b/i.test(title)
    || /\s-\s(?:E(?:P)?\s*)?\d{1,3}(?=$|[\s[(])/i.test(title)
  ) return 0;
  return 1;
}

function codecScore(value: ResourceResult['codec']): number {
  if (value === 'H.264') return 2;
  if (value === 'unknown') return 1;
  return 0;
}

function resolutionScore(value: ResourceResult['resolution']): number {
  if (value === '1080p') return 3;
  if (value === '720p') return 2;
  if (value === '2160p') return 1;
  return 0;
}

function subtitleScore(title: string): number {
  return /\b(?:multi[- ]?subs?|english\s+subs?|eng(?:lish)?[- ]?sub)\b/i.test(title) ? 1 : 0;
}

function sizeScore(resource: ResourceResult): number {
  if (resource.sizeBytes == null) return 1;
  const gib = resource.sizeBytes / 1024 ** 3;
  const scope = releaseScopeScore(resource.title);
  if (scope === 2) {
    if (gib >= 4 && gib <= 40) return 3;
    if (gib >= 1 && gib <= 60) return 2;
    return gib <= 100 ? 1 : 0;
  }
  if (scope === 0) {
    if (gib >= 0.2 && gib <= 4) return 3;
    return gib <= 8 ? 2 : 1;
  }
  return 1;
}

function resourceScore(a: ResourceResult, b: ResourceResult): number {
  const scope = releaseScopeScore(b.title) - releaseScopeScore(a.title);
  if (scope) return scope;
  const directPlay = Number(!b.needsTranscode) - Number(!a.needsTranscode);
  if (directPlay) return directPlay;
  const compatibleCodec = codecScore(b.codec) - codecScore(a.codec);
  if (compatibleCodec) return compatibleCodec;
  const preferredResolution = resolutionScore(b.resolution) - resolutionScore(a.resolution);
  if (preferredResolution) return preferredResolution;
  const reasonableSize = sizeScore(b) - sizeScore(a);
  if (reasonableSize) return reasonableSize;
  const original = Number(!b.remake) - Number(!a.remake);
  if (original) return original;
  const trusted = Number(b.trusted) - Number(a.trusted);
  if (trusted) return trusted;
  const subtitles = subtitleScore(b.title) - subtitleScore(a.title);
  if (subtitles) return subtitles;
  const seeds = b.seeders - a.seeders;
  if (seeds) return seeds;
  return Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '') || 0;
}

export function parseNyaaRss(
  xml: string,
  options: ResourceSearchOptions = {},
  platform: NodeJS.Platform = process.platform,
): ResourceResult[] {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) {
    throw new ResourceUpstreamError('Nyaa returned invalid RSS');
  }

  const results = new Map<string, ResourceResult>();
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = readTag(block, 'title');
    const id = readTag(block, 'nyaa:infoHash').toLowerCase();
    const detailUrl = safeDetailUrl(readTag(block, 'guid'));
    const magnet = buildMagnet(id, title);
    if (!title || !detailUrl || !magnet || results.has(id)) continue;
    const detectedCodec = codec(title);
    const tenBit = /\b10[- ]?bit\b/i.test(title);
    const size = readTag(block, 'nyaa:size');
    results.set(id, {
      id,
      title,
      detailUrl,
      magnet,
      size,
      sizeBytes: parseSizeBytes(size),
      seeders: parseCount(readTag(block, 'nyaa:seeders')),
      leechers: parseCount(readTag(block, 'nyaa:leechers')),
      downloads: parseCount(readTag(block, 'nyaa:downloads')),
      publishedAt: parsePublishedAt(readTag(block, 'pubDate')),
      trusted: readTag(block, 'nyaa:trusted').toLowerCase() === 'yes',
      remake: readTag(block, 'nyaa:remake').toLowerCase() === 'yes',
      category: readTag(block, 'nyaa:category'),
      releaseGroup: releaseGroup(title),
      resolution: resolution(title),
      codec: detectedCodec,
      needsTranscode: detectedCodec === 'AV1'
        || (detectedCodec === 'H.265' && platform !== 'darwin')
        || (tenBit && detectedCodec !== 'H.265'),
    });
  }
  const matching = options.season == null
    ? [...results.values()]
    : [...results.values()].filter((entry) => matchesResourceSeason(entry.title, options.season!));
  return matching.sort(resourceScore).slice(0, 20);
}

export function createNyaaResourceProvider(
  fetchImpl: ResourceFetch = fetch,
  now: () => number = Date.now,
  platform: NodeJS.Platform = process.platform,
): ResourceProvider {
  const cache = new Map<string, { expiresAt: number; items: ResourceResult[] }>();

  async function searchOne(
    query: string,
    category: ResourceCategory,
    options: ResourceSearchOptions,
  ): Promise<ResourceResult[]> {
    // kind をキーに含めないと、同じ検索語がアニメと実写でキャッシュを共有し、
    // 別カテゴリの結果を返してしまう。
    const kind: ContentKind = options.kind ?? 'anime';
    const key = `${kind}:${category}:${options.season ?? 'any'}:${query.toLocaleLowerCase()}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.items;

    const url = new URL('/', NYAA_ORIGIN);
    url.search = new URLSearchParams({
      page: 'rss',
      c: nyaaCategoryId(kind, category),
      f: '0',
      q: query,
    }).toString();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new ResourceUpstreamError(error instanceof Error ? error.message : undefined);
    }
    if (!response.ok) throw new ResourceUpstreamError(`Nyaa returned ${response.status}`);
    try {
      const items = parseNyaaRss(await response.text(), options, platform);
      cache.set(key, { expiresAt: now() + CACHE_TTL_MS, items });
      return items;
    } catch (error) {
      if (error instanceof ResourceUpstreamError) throw error;
      throw new ResourceUpstreamError('Nyaa returned invalid RSS');
    }
  }

  return {
    async search(queries, category, options = {}) {
      const uniqueQueries = [...new Map(queries
        .map((query) => query.trim())
        .filter(Boolean)
        .map((query) => [query.toLocaleLowerCase(), query])).values()];
      for (const query of uniqueQueries) {
        const items = await searchOne(query, category, options);
        if (items.length) return { items, query };
      }
      return { items: [], query: uniqueQueries[0] ?? '' };
    },
  };
}
