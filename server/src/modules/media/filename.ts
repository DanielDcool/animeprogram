export interface ParsedName {
  series: string;
  episode: number | null;
}

export function parseFilename(fileName: string): ParsedName {
  let base = fileName.replace(/\.[^.]+$/, '');
  // 先頭の字幕グループタグと末尾のハッシュ/解像度括弧を除去
  base = base.replace(/^\[[^\]]*\]\s*/, '');
  while (/\s*[[(][^\])]*[\])]\s*$/.test(base)) {
    base = base.replace(/\s*[[(][^\])]*[\])]\s*$/, '');
  }

  // "Series - 05" / "Series - 05v2" / "Series - 12 END"
  let m = base.match(/^(.*?)\s*-\s*(\d{1,3}(?:\.\d)?)(?:v\d+)?(?:\s+END)?\s*$/i);
  if (m) return { series: m[1].trim(), episode: Number(m[2]) };

  // "Series 第08話"
  m = base.match(/^(.*?)\s*第\s*(\d{1,3})\s*話?\s*$/);
  if (m) return { series: m[1].trim(), episode: Number(m[2]) };

  // 話数が取れない場合は括弧を含む元の名前をそのまま（映画の年号など）
  const original = fileName.replace(/\.[^.]+$/, '').replace(/^\[[^\]]*\]\s*/, '');
  return { series: original.trim(), episode: null };
}
