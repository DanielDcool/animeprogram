const ROMAN_SEASONS: Record<string, number> = {
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  'Ⅱ': 2,
  'Ⅲ': 3,
  'Ⅳ': 4,
  'Ⅴ': 5,
  'Ⅵ': 6,
  'Ⅶ': 7,
  'Ⅷ': 8,
  'Ⅸ': 9,
  'Ⅹ': 10,
};

function explicitSeasonNumber(title: string): number | null {
  const decimalPatterns = [
    /\bseason\s*0?(\d{1,2})\b/i,
    /\bs0?(\d{1,2})(?=\b|e\d)/i,
    /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i,
    /第\s*0?(\d{1,2})\s*期/u,
  ];
  for (const pattern of decimalPatterns) {
    const match = title.match(pattern);
    if (match) return Number(match[1]);
  }

  const unicodeRoman = title.match(/[ⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/u)?.[0];
  if (unicodeRoman) return ROMAN_SEASONS[unicodeRoman];

  const asciiRoman = title.match(/(?:^|[\s:：])((?:VIII|VII|VI|IX|IV|III|II|V|X))(?=$|[\s:：~～-])/i)?.[1];
  return asciiRoman ? ROMAN_SEASONS[asciiRoman.toUpperCase()] : null;
}

export function inferSeasonNumber(titles: Array<string | null>): number {
  for (const title of titles) {
    if (!title) continue;
    const season = explicitSeasonNumber(title);
    if (season != null) return season;
  }
  return 1;
}

export function buildSeasonSearchQueries(
  titles: Array<string | null>,
  season: number,
): string[] {
  const uniqueTitles = [...new Map(titles
    .map((title) => title?.trim())
    .filter((title): title is string => Boolean(title))
    .map((title) => [title.toLocaleLowerCase(), title])).values()];
  const seasonTag = `S${String(season).padStart(2, '0')}`;
  return [...new Map([
    ...uniqueTitles.map((title) => `${title} ${seasonTag}`),
    ...uniqueTitles,
  ].map((query) => [query.toLocaleLowerCase(), query])).values()];
}

export function matchesResourceSeason(title: string, season: number): boolean {
  return (explicitSeasonNumber(title) ?? 1) === season;
}
