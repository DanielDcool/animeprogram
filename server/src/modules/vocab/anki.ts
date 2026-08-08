import { createHash } from 'node:crypto';

export const ANKI_DECK_NAME = 'tanku Anime';
export const ANKI_MODEL_NAME = 'tanku Anime';
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';

export interface VocabExportRow {
  kind: 'word' | 'sentence';
  word: string | null;
  reading: string | null;
  gloss: string | null;
  sentence: string;
  translation: string | null;
  mediaId: number | null;
  positionSec: number | null;
  series: string | null;
  episode: number | null;
}

interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: { Key: string; Front: string; Back: string };
  options: {
    allowDuplicate: false;
    duplicateScope: 'deck';
    duplicateScopeOptions: { deckName: string; checkChildren: false; checkAllModels: false };
  };
  tags: string[];
}

export type AnkiInvoke = <T = unknown>(action: string, params?: Record<string, unknown>) => Promise<T>;

export class AnkiConnectUnavailableError extends Error {
  constructor() {
    super('AnkiConnect is unavailable');
    this.name = 'AnkiConnectUnavailableError';
  }
}

export class AnkiConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnkiConnectError';
  }
}

export function createAnkiInvoke(fetchFn: typeof fetch = fetch): AnkiInvoke {
  return async <T>(action: string, params: Record<string, unknown> = {}): Promise<T> => {
    let response: Response;
    try {
      response = await fetchFn(ANKI_CONNECT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, version: 6, params }),
        signal: AbortSignal.timeout(3_000),
      });
    } catch {
      throw new AnkiConnectUnavailableError();
    }
    if (!response.ok) throw new AnkiConnectError(`AnkiConnect HTTP ${response.status}`);

    let payload: { result?: T; error?: string | null };
    try {
      payload = await response.json() as { result?: T; error?: string | null };
    } catch {
      throw new AnkiConnectError('AnkiConnect returned invalid JSON');
    }
    if (!Object.hasOwn(payload, 'result') || !Object.hasOwn(payload, 'error')) {
      throw new AnkiConnectError('AnkiConnect returned an invalid response');
    }
    if (payload.error) throw new AnkiConnectError(payload.error);
    return payload.result as T;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '<br>');
}

function sourceHtml(row: VocabExportRow): string | null {
  if (!row.series) return null;
  const label = `${row.series}${row.episode == null ? '' : ` 第${row.episode}話`}`;
  if (row.mediaId == null || row.positionSec == null) return escapeHtml(label);
  const url = `http://localhost:5173/player/${row.mediaId}?t=${row.positionSec}`;
  return `<a href="${url}">${escapeHtml(label)}</a>`;
}

function buildNote(row: VocabExportRow): AnkiNote {
  const key = createHash('sha256')
    .update([row.kind, row.word ?? '', row.sentence].join('\0'))
    .digest('hex');
  const front = escapeHtml(row.kind === 'word' ? (row.word ?? row.sentence) : row.sentence);
  const backParts = (row.kind === 'word'
    ? [row.reading, row.gloss, row.sentence ? `例: ${row.sentence}` : null]
    : [row.translation])
    .filter((part): part is string => Boolean(part))
    .map(escapeHtml);
  const source = sourceHtml(row);
  if (source) backParts.push(`出典: ${source}`);

  return {
    deckName: ANKI_DECK_NAME,
    modelName: ANKI_MODEL_NAME,
    fields: {
      Key: key,
      Front: front,
      Back: backParts.join('<br>'),
    },
    options: {
      allowDuplicate: false,
      duplicateScope: 'deck',
      duplicateScopeOptions: {
        deckName: ANKI_DECK_NAME,
        checkChildren: false,
        checkAllModels: false,
      },
    },
    tags: ['tanku-anime', row.kind],
  };
}

export async function exportVocabToAnki(
  rows: VocabExportRow[],
  invoke: AnkiInvoke,
): Promise<{ deck: string; added: number; skipped: number; total: number }> {
  if (rows.length === 0) return { deck: ANKI_DECK_NAME, added: 0, skipped: 0, total: 0 };

  await invoke('createDeck', { deck: ANKI_DECK_NAME });
  const modelNames = await invoke<string[]>('modelNames');
  if (!modelNames.includes(ANKI_MODEL_NAME)) {
    await invoke('createModel', {
      modelName: ANKI_MODEL_NAME,
      inOrderFields: ['Key', 'Front', 'Back'],
      css: '.card { font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif; font-size: 24px; text-align: left; line-height: 1.6; }',
      isCloze: false,
      cardTemplates: [{
        Name: 'tanku Anime Card',
        Front: '{{Front}}',
        Back: '{{FrontSide}}<hr id="answer">{{Back}}',
      }],
    });
  }

  const notes = rows.map(buildNote);
  const canAdd = await invoke<boolean[]>('canAddNotes', { notes });
  const newNotes = notes.filter((_note, index) => canAdd[index]);
  const addedIds = newNotes.length > 0
    ? await invoke<(number | null)[]>('addNotes', { notes: newNotes })
    : [];
  const added = addedIds.filter((id) => id != null).length;
  return {
    deck: ANKI_DECK_NAME,
    added,
    skipped: rows.length - added,
    total: rows.length,
  };
}
