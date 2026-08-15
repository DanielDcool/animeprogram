export interface ParsedName {
  series: string;
  episode: number | null;
}

// タイトル末尾のゴミ（年号・画質・ソース・コーデック・音声・リリースグループ・括弧タグ）を落とす。
function cleanTitle(raw: string): string {
  let t = raw.replace(/[._]+/g, ' ').trim();
  let prev = '';
  while (t !== prev && t.length > 0) {
    prev = t;
    // 末尾の [..] / (..) / （..） タグ（画質・年号・グループ等）
    t = t.replace(/\s*[[(（][^\])）]*[\])）]\s*$/u, '').trim();
    // 括弧なしの末尾年号
    t = t.replace(/\s+(?:19|20)\d{2}$/, '').trim();
    // 末尾の単独ゴミトークン
    t = t.replace(
      /\s+(?:1080p|720p|480p|2160p|4k|bd|bluray|web-?dl|webrip|hdtv|x26[45]|h\.?26[45]|hevc|avc|aac|flac|opus|ddp?\d(?:\.\d)?|dual|multi|uncensored|repack|proper)$/i,
      '',
    ).trim();
    // 末尾の区切り記号
    t = t.replace(/[\s.\-_~|]+$/, '').trim();
  }
  return t;
}

export function parseFilename(fileName: string): ParsedName {
  // 1. 拡張子を除去
  let base = fileName.replace(/\.[^.]+$/, '');

  // 2. 先頭の [グループ] タグ（複数可）を除去
  base = base.replace(/^(?:\[[^\]]*\]\s*)+/, '');

  // 3. ドット区切りの scene リリースはスペースに正規化（スペースが無い場合のみ）
  if (!base.includes(' ') && (base.includes('.') || base.includes('_'))) {
    base = base.replace(/[._]+/g, ' ');
  } else {
    base = base.replace(/_+/g, ' ');
  }
  base = base.trim();

  let series: string | null = null;
  let episode: number | null = null;

  // SxxExx（S02E01 / S1E7、末尾に v2 等が付く場合あり）を最優先
  let m = base.match(/^(.*?)[\s.\-_]+S\d{1,2}E(\d{1,3})(?:v\d+)?\b/i);
  if (m) { series = m[1]; episode = Number(m[2]); }

  // "Series - 05" / "- 05v2" / "- 12 END"（タイトル内に " - " があっても最後の数値で判定）
  if (series == null) {
    m = base.match(/^(.*)\s+-\s+(\d{1,3})(?:v\d+)?(?:\s+END)?\b/i);
    if (m) { series = m[1]; episode = Number(m[2]); }
  }

  // "Series 第08話"
  if (series == null) {
    m = base.match(/^(.*?)\s*第\s*(\d{1,3})\s*話?\b/);
    if (m) { series = m[1]; episode = Number(m[2]); }
  }

  // 話数マーカーが無い（映画など）→ 全体をタイトル扱い
  if (series == null) series = base;

  return { series: cleanTitle(series), episode };
}
