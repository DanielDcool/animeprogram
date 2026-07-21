// jimaku.cc API クライアント
// 認証: Authorization ヘッダに API キーをそのまま入れる（https://jimaku.cc/profile で取得）
// レート制限: 25 リクエスト/分

export interface JimakuEntry {
  id: number;
  name: string;
  english_name?: string;
  japanese_name?: string;
  anilist_id?: number;
}

export interface JimakuFile {
  url: string;
  name: string;
  size: number;
}

export interface JimakuClient {
  search(query: string): Promise<JimakuEntry[]>;
  files(entryId: number, episode?: number | null): Promise<JimakuFile[]>;
  download(url: string): Promise<Buffer>;
}

const BASE = 'https://jimaku.cc/api';

export function createJimakuClient(apiKey: string, fetchFn: typeof fetch = fetch): JimakuClient {
  const headers = { Authorization: apiKey };

  async function getJson<T>(url: string): Promise<T> {
    const res = await fetchFn(url, { headers });
    if (!res.ok) throw new Error(`jimaku API ${res.status}: ${url}`);
    return res.json() as Promise<T>;
  }

  return {
    search: (query) =>
      getJson<JimakuEntry[]>(`${BASE}/entries/search?anime=true&query=${encodeURIComponent(query)}`),
    files: (entryId, episode) =>
      getJson<JimakuFile[]>(
        `${BASE}/entries/${entryId}/files${episode != null ? `?episode=${episode}` : ''}`,
      ),
    download: async (url) => {
      const res = await fetchFn(url, { headers });
      if (!res.ok) throw new Error(`jimaku download ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

/** srt を ass より優先。アーカイブ（zip/7z/rar）は対象外 */
export function pickBestFile(files: JimakuFile[]): JimakuFile | null {
  const rank = (f: JimakuFile) => (/\.srt$/i.test(f.name) ? 0 : /\.ass$/i.test(f.name) ? 1 : 9);
  const subs = files.filter((f) => rank(f) < 9);
  if (subs.length === 0) return null;
  return subs.sort((a, b) => rank(a) - rank(b))[0];
}
