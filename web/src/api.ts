import type {
  AnkiExportResult,
  CatalogAnime,
  CatalogDrama,
  CatalogHome,
  DramaHome,
  Explanation,
  MediaItem,
  ResourceCategory,
  ResourceSearchResponse,
  SubtitleData,
  Token,
  VocabDetail,
  VocabItem,
} from './types';

export function joinApiBase(path: string, base = import.meta.env.VITE_API_BASE_URL ?? ''): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(joinApiBase(path), init);
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: await res.json().catch(() => null) });
  return res.json();
}

export const api = {
  listMedia: () => request('/api/media').then((r) => j<MediaItem[]>(r)),
  scan: () => request('/api/media/scan', { method: 'POST' }).then((r) => j<{ ok: true }>(r)),
  subtitles: (id: number) => request(`/api/media/${id}/subtitles`).then((r) => j<SubtitleData>(r)),
  setOffset: (id: number, offsetMs: number) =>
    request(`/api/media/${id}/subtitle-offset`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offsetMs }) }).then((r) => j(r)),
  analyze: (text: string) =>
    request('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).then((r) => j<{ tokens: Token[] }>(r)),
  explain: (text: string, context: string[]) =>
    request('/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, context }) }).then((r) => j<{ cached: boolean; explanation: Explanation }>(r)),
  saveProgress: (id: number, positionSec: number) =>
    request(`/api/media/${id}/progress`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ positionSec }), keepalive: true }),
  getProgress: (id: number) => request(`/api/media/${id}/progress`).then((r) => j<{ positionSec: number }>(r)),
  jimakuCandidates: (id: number) =>
    request(`/api/media/${id}/jimaku/candidates`).then((r) =>
      j<{ mappingEntryId: number | null; candidates: { id: number; name: string; englishName: string | null; japaneseName: string | null }[] }>(r)),
  jimakuDownload: (id: number, entryId?: number) =>
    request(`/api/media/${id}/jimaku/download`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entryId != null ? { entryId } : {}) }).then((r) => j<{ ok: true; file: string }>(r)),
  saveVocab: (item: {
    kind: 'word' | 'sentence'; word?: string; reading?: string; gloss?: string;
    sentence: string; translation?: string; mediaId?: number; positionSec?: number;
  }) =>
    request('/api/vocab', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item) }).then((r) => j<{ saved: boolean }>(r)),
  listVocab: () => request('/api/vocab').then((r) => j<VocabItem[]>(r)),
  getVocab: (id: number) => request(`/api/vocab/${id}`).then((r) => j<VocabDetail>(r)),
  deleteVocab: (id: number) => request(`/api/vocab/${id}`, { method: 'DELETE' }).then((r) => j(r)),
  exportVocabToAnki: () => request('/api/vocab/export-anki', { method: 'POST' }).then((r) => j<AnkiExportResult>(r)),
  getSettings: () => request('/api/settings').then((r) => j<{
    ai_provider: 'anthropic' | 'deepseek' | 'openai' | 'gemini'; ai_model: string;
    explain_language: 'auto' | 'zh' | 'en'; explain_language_detected: 'zh' | 'en';
    anthropic_api_key_set: boolean; deepseek_api_key_set: boolean; openai_api_key_set: boolean;
    gemini_api_key_set: boolean;
    jimaku_api_key_set: boolean;
    media_dir: string; default_media_dir: string; media_dir_overridden: boolean;
  }>(r)),
  saveSettings: (s: Record<string, string>) =>
    request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }).then((r) => j(r)),
  catalogHome: () => request('/api/catalog/home').then((r) => j<CatalogHome>(r)),
  catalogSearch: (query: string) =>
    request(`/api/catalog/search?q=${encodeURIComponent(query)}`).then((r) => j<{ items: CatalogAnime[] }>(r)),
  catalogDetail: (id: number) => request(`/api/catalog/anime/${id}`).then((r) => j<CatalogAnime>(r)),
  catalogResources: (id: number, category: ResourceCategory) =>
    request(`/api/catalog/anime/${id}/resources?category=${encodeURIComponent(category)}`)
      .then((r) => j<ResourceSearchResponse>(r)),
  dramaHome: () => request('/api/drama/home').then((r) => j<DramaHome>(r)),
  /** キーワードで Bangumi の作品カタログを引く */
  dramaSearch: (query: string) =>
    request(`/api/drama/search?q=${encodeURIComponent(query)}`).then((r) => j<{ items: CatalogDrama[] }>(r)),
  /** キーワードで Nyaa の実写カテゴリを直接引く（作品カタログは経由しない）。「もっと探す」用 */
  dramaSearchResources: (query: string, category: ResourceCategory) =>
    request(`/api/drama/search/resources?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`)
      .then((r) => j<ResourceSearchResponse>(r)),
  dramaDetail: (id: number) => request(`/api/drama/${id}`).then((r) => j<CatalogDrama>(r)),
  dramaResources: (id: number, category: ResourceCategory) =>
    request(`/api/drama/${id}/resources?category=${encodeURIComponent(category)}`)
      .then((r) => j<ResourceSearchResponse>(r)),
  dramaBangumiDetail: (id: number) => request(`/api/drama/bgm/${id}`).then((r) => j<CatalogDrama>(r)),
  dramaBangumiResources: (id: number, category: ResourceCategory) =>
    request(`/api/drama/bgm/${id}/resources?category=${encodeURIComponent(category)}`)
      .then((r) => j<ResourceSearchResponse>(r)),
};
