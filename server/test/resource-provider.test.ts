import { describe, expect, it, vi } from 'vitest';
import {
  createNyaaResourceProvider,
  parseNyaaRss,
} from '../src/modules/resource/nyaa.js';
import { ResourceUpstreamError } from '../src/modules/resource/provider.js';
import {
  buildSeasonSearchQueries,
  inferSeasonNumber,
  matchesResourceSeason,
} from '../src/modules/resource/season.js';

const rss = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
  <channel><title>Nyaa</title>${items}</channel>
</rss>`;

const item = ({
  title = '[SubsPlease] Test Anime - 01 (1080p) [H.264]',
  hash = '0123456789abcdef0123456789abcdef01234567',
  seeders = 20,
  trusted = 'Yes',
  remake = 'No',
  size = '1.25 GiB',
  pubDate = 'Tue, 21 Jul 2026 12:00:00 +0000',
} = {}) => `
<item>
  <title><![CDATA[${title}]]></title>
  <link>https://nyaa.si/download/123.torrent</link>
  <guid isPermaLink="true">https://nyaa.si/view/123</guid>
  <pubDate>${pubDate}</pubDate>
  <nyaa:seeders>${seeders}</nyaa:seeders>
  <nyaa:leechers>3</nyaa:leechers>
  <nyaa:downloads>99</nyaa:downloads>
  <nyaa:infoHash>${hash}</nyaa:infoHash>
  <nyaa:category>Anime - English-translated</nyaa:category>
  <nyaa:size>${size}</nyaa:size>
  <nyaa:trusted>${trusted}</nyaa:trusted>
  <nyaa:remake>${remake}</nyaa:remake>
</item>`;

describe('Nyaa RSS resource provider', () => {
  it('infers explicit season markers and treats an unmarked title as season one', () => {
    expect(inferSeasonNumber(['無職転生 ～異世界行ったら本気だす～'])).toBe(1);
    expect(inferSeasonNumber(['無職転生Ⅱ ～異世界行ったら本気だす～'])).toBe(2);
    expect(inferSeasonNumber(['Mushoku Tensei III: Isekai Ittara Honki Dasu'])).toBe(3);
    expect(inferSeasonNumber(['Example Anime 2nd Season'])).toBe(2);
    expect(inferSeasonNumber(['テストアニメ 第3期'])).toBe(3);
  });

  it('builds season-specific queries before broad title fallbacks', () => {
    expect(buildSeasonSearchQueries(
      ['無職転生', 'Mushoku Tensei', 'Mushoku Tensei'],
      1,
    )).toEqual([
      '無職転生 S01',
      'Mushoku Tensei S01',
      '無職転生',
      'Mushoku Tensei',
    ]);
  });

  it('keeps only releases that match the selected anime season', () => {
    expect(matchesResourceSeason('[Group] Mushoku Tensei - 01', 1)).toBe(true);
    expect(matchesResourceSeason('[Group] Mushoku Tensei S01 - 01', 1)).toBe(true);
    expect(matchesResourceSeason('[Group] Mushoku Tensei II - 01', 1)).toBe(false);
    expect(matchesResourceSeason('[Group] Mushoku Tensei III - 01', 1)).toBe(false);
    expect(matchesResourceSeason('[Group] Mushoku Tensei S03E05 - 05', 1)).toBe(false);
    expect(matchesResourceSeason('[Group] Mushoku Tensei II - 01', 2)).toBe(true);
    expect(matchesResourceSeason('[Group] Mushoku Tensei S02 - 01', 2)).toBe(true);
    expect(matchesResourceSeason('[Group] Mushoku Tensei S02E01 - 01', 2)).toBe(true);
    expect(matchesResourceSeason('[Group] Mushoku Tensei 2nd Season - 01', 2)).toBe(true);
    expect(matchesResourceSeason('[Group] Mushoku Tensei - 01', 2)).toBe(false);
  });

  it('parses fixed RSS fields and constructs a validated magnet link', () => {
    const [result] = parseNyaaRss(rss(item()));

    expect(result).toMatchObject({
      id: '0123456789abcdef0123456789abcdef01234567',
      title: '[SubsPlease] Test Anime - 01 (1080p) [H.264]',
      detailUrl: 'https://nyaa.si/view/123',
      size: '1.25 GiB',
      sizeBytes: 1_342_177_280,
      seeders: 20,
      leechers: 3,
      downloads: 99,
      trusted: true,
      remake: false,
      category: 'Anime - English-translated',
      releaseGroup: 'SubsPlease',
      resolution: '1080p',
      codec: 'H.264',
      needsTranscode: false,
      publishedAt: '2026-07-21T12:00:00.000Z',
    });
    expect(result.magnet).toBe(
      'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=%5BSubsPlease%5D%20Test%20Anime%20-%2001%20(1080p)%20%5BH.264%5D',
    );
    expect(result.magnet).not.toContain('urn%3Abtih');
  });

  it('drops entries with an invalid info hash or unsafe detail URL', () => {
    const invalidHash = item({ hash: 'not-a-hash' });
    const unsafeUrl = item({ hash: '1111111111111111111111111111111111111111' })
      .replace('https://nyaa.si/view/123', 'javascript:alert(1)');

    expect(parseNyaaRss(rss(invalidHash + unsafeUrl))).toEqual([]);
  });

  it('recognizes codecs and keeps verified 10-bit H.265 out of the conversion warning', () => {
    const results = parseNyaaRss(rss(
      item({ title: '[A] Show [720p][HEVC][10-bit]', hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
      + item({ title: '[B] Show [2160p][AV1]', hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
    ), {}, 'darwin');

    expect(results.find((entry) => entry.releaseGroup === 'A')).toMatchObject({
      resolution: '720p', codec: 'H.265', needsTranscode: false,
    });
    expect(results.find((entry) => entry.releaseGroup === 'B')).toMatchObject({
      resolution: '2160p', codec: 'AV1', needsTranscode: true,
    });
  });

  it('warns that H.265 may need conversion on Windows', () => {
    const [result] = parseNyaaRss(rss(
      item({ title: '[A] Show [1080p][HEVC][10-bit]' }),
    ), {}, 'win32');

    expect(result).toMatchObject({ codec: 'H.265', needsTranscode: true });
  });

  it('marks 10-bit H.264 as needing conversion and prefers an 8-bit season pack', () => {
    const results = parseNyaaRss(rss(
      item({
        title: '[Hi10] Show S01 [1080p][x264 10-bit][Multi-Subs]',
        hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        seeders: 500,
      })
      + item({
        title: '[Direct] Show S01 [1080p][x264][Multi-Subs]',
        hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        seeders: 10,
      }),
    ), { season: 1 });

    expect(results.map((entry) => entry.releaseGroup)).toEqual(['Direct', 'Hi10']);
    expect(results.find((entry) => entry.releaseGroup === 'Hi10')?.needsTranscode).toBe(true);
  });

  it('uses resolution, trust and seeders as tie-breakers for otherwise similar releases', () => {
    const results = parseNyaaRss(rss(
      item({ title: '[Untrusted] Show [1080p][H.264]', hash: '1111111111111111111111111111111111111111', seeders: 500, trusted: 'No' })
      + item({ title: '[Trusted720] Show [720p][H.264]', hash: '2222222222222222222222222222222222222222', seeders: 50 })
      + item({ title: '[Trusted1080] Show [1080p][H.264]', hash: '3333333333333333333333333333333333333333', seeders: 50 }),
    ));

    expect(results.map((entry) => entry.releaseGroup)).toEqual([
      'Trusted1080', 'Untrusted', 'Trusted720',
    ]);
  });

  it('ranks a playable complete-season release above popular but unsuitable candidates', () => {
    const results = parseNyaaRss(rss(
      item({
        title: '[Episode] Show S01E01 [1080p][H.264][Multi-Subs]',
        hash: '1111111111111111111111111111111111111111',
        seeders: 2_000,
      })
      + item({
        title: '[HighSeeds4K] Show S01 [2160p][HEVC][Multi-Subs]',
        hash: '2222222222222222222222222222222222222222',
        seeders: 1_500,
      })
      + item({
        title: '[Remake] Show S01 [1080p][H.264][Multi-Subs]',
        hash: '3333333333333333333333333333333333333333',
        seeders: 1_000,
        remake: 'Yes',
      })
      + item({
        title: '[Untrusted] Show S01 [1080p][H.264][Multi-Subs]',
        hash: '4444444444444444444444444444444444444444',
        seeders: 800,
        trusted: 'No',
      })
      + item({
        title: '[Recommended] Show S01 [1080p][H.264][Multi-Subs]',
        hash: '5555555555555555555555555555555555555555',
        seeders: 50,
      }),
    ), { season: 1 });

    expect(results.map((entry) => entry.releaseGroup)).toEqual([
      'Recommended',
      'Untrusted',
      'Remake',
      'HighSeeds4K',
      'Episode',
    ]);
  });

  it('prefers a reasonable season-pack size over an oversized equivalent', () => {
    const results = parseNyaaRss(rss(
      item({
        title: '[Oversized] Show S01 [1080p][HEVC][Multi-Subs]',
        hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        seeders: 500,
        size: '80.2 GiB',
      })
      + item({
        title: '[Reasonable] Show S01 [1080p][HEVC][Multi-Subs]',
        hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        seeders: 10,
        size: '16.9 GiB',
      }),
    ), { season: 1 });

    expect(results.map((entry) => entry.releaseGroup)).toEqual(['Reasonable', 'Oversized']);
  });

  it('keeps only the top twenty ranked results for the detail page', () => {
    const manyItems = Array.from({ length: 25 }, (_, index) => item({
      title: `[Group${index}] Test Anime [1080p][H.264]`,
      hash: index.toString(16).padStart(40, '0'),
      seeders: index,
    })).join('');

    const results = parseNyaaRss(rss(manyItems));

    expect(results).toHaveLength(20);
    expect(results[0].releaseGroup).toBe('Group24');
    expect(results.at(-1)?.releaseGroup).toBe('Group5');
  });

  it('filters mismatched seasons before limiting the result list', async () => {
    const seasonThreeItems = Array.from({ length: 20 }, (_, index) => item({
      title: `[S3Group${index}] Mushoku Tensei III - ${String(index + 1).padStart(2, '0')} [1080p][H.264]`,
      hash: (index + 1).toString(16).padStart(40, '0'),
      seeders: 1_000 - index,
    })).join('');
    const seasonOneItem = item({
      title: '[S1Group] Mushoku Tensei - 01 [1080p][H.264]',
      hash: 'ffffffffffffffffffffffffffffffffffffffff',
      seeders: 1,
    });
    const provider = createNyaaResourceProvider(
      vi.fn().mockResolvedValue(new Response(rss(seasonThreeItems + seasonOneItem), { status: 200 })),
    );

    const result = await provider.search(['Mushoku Tensei'], 'english', { season: 1 });

    expect(result.items.map((entry) => entry.releaseGroup)).toEqual(['S1Group']);
  });

  it('falls back to the next title, deduplicates hashes and caches the successful query', async () => {
    let now = 1_000;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(rss(''), { status: 200 }))
      .mockResolvedValueOnce(new Response(rss(item() + item()), { status: 200 }));
    const provider = createNyaaResourceProvider(fetchImpl, () => now);

    const first = await provider.search(['日本語タイトル', 'Test Anime'], 'english');
    now += 60_000;
    const second = await provider.search(['日本語タイトル', 'Test Anime'], 'english');

    expect(first.query).toBe('Test Anime');
    expect(first.items).toHaveLength(1);
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(firstUrl.searchParams.get('c')).toBe('1_2');
    expect(firstUrl.searchParams.get('q')).toBe('日本語タイトル');
  });

  it('maps upstream failures and malformed XML to ResourceUpstreamError', async () => {
    const unavailable = createNyaaResourceProvider(
      vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })),
    );
    const malformed = createNyaaResourceProvider(
      vi.fn().mockResolvedValue(new Response('<html>blocked</html>', { status: 200 })),
    );

    await expect(unavailable.search(['Test Anime'], 'raw')).rejects.toBeInstanceOf(ResourceUpstreamError);
    await expect(malformed.search(['Test Anime'], 'all')).rejects.toBeInstanceOf(ResourceUpstreamError);
  });
});
