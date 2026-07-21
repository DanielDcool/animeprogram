import type { MediaItem, SubtitleData, Token, Explanation, VocabItem } from './types';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: await res.json().catch(() => null) });
  return res.json();
}

export const api = {
  listMedia: () => fetch('/api/media').then((r) => j<MediaItem[]>(r)),
  scan: () => fetch('/api/media/scan', { method: 'POST' }).then((r) => j<{ ok: true }>(r)),
  subtitles: (id: number) => fetch(`/api/media/${id}/subtitles`).then((r) => j<SubtitleData>(r)),
  setOffset: (id: number, offsetMs: number) =>
    fetch(`/api/media/${id}/subtitle-offset`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offsetMs }) }).then((r) => j(r)),
  analyze: (text: string) =>
    fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).then((r) => j<{ tokens: Token[] }>(r)),
  explain: (text: string, context: string[]) =>
    fetch('/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, context }) }).then((r) => j<{ cached: boolean; explanation: Explanation }>(r)),
  saveProgress: (id: number, positionSec: number) =>
    fetch(`/api/media/${id}/progress`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ positionSec }) }),
  jimakuCandidates: (id: number) =>
    fetch(`/api/media/${id}/jimaku/candidates`).then((r) =>
      j<{ mappingEntryId: number | null; candidates: { id: number; name: string; englishName: string | null; japaneseName: string | null }[] }>(r)),
  jimakuDownload: (id: number, entryId?: number) =>
    fetch(`/api/media/${id}/jimaku/download`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entryId != null ? { entryId } : {}) }).then((r) => j<{ ok: true; file: string }>(r)),
  saveVocab: (item: {
    kind: 'word' | 'sentence'; word?: string; reading?: string; gloss?: string;
    sentence: string; translation?: string; mediaId?: number; positionSec?: number;
  }) =>
    fetch('/api/vocab', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item) }).then((r) => j<{ saved: boolean }>(r)),
  listVocab: () => fetch('/api/vocab').then((r) => j<VocabItem[]>(r)),
  deleteVocab: (id: number) => fetch(`/api/vocab/${id}`, { method: 'DELETE' }).then((r) => j(r)),
  getSettings: () => fetch('/api/settings').then((r) => j<{ ai_model: string; anthropic_api_key_set: boolean; jimaku_api_key_set: boolean }>(r)),
  saveSettings: (s: Record<string, string>) =>
    fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }).then((r) => j(r)),
};
