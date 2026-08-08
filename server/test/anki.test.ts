import { describe, expect, it, vi } from 'vitest';
import {
  ANKI_DECK_NAME,
  ANKI_MODEL_NAME,
  AnkiConnectUnavailableError,
  createAnkiInvoke,
  exportVocabToAnki,
  type AnkiInvoke,
  type VocabExportRow,
} from '../src/modules/vocab/anki.js';

const rows: VocabExportRow[] = [
  {
    kind: 'word',
    word: '食べる',
    reading: 'たべる',
    gloss: 'to eat',
    sentence: '食べたら帰ろうか',
    translation: null,
    mediaId: 1,
    positionSec: 17.5,
    series: 'Frieren',
    episode: 3,
  },
  {
    kind: 'sentence',
    word: null,
    reading: null,
    gloss: null,
    sentence: '<b>危ない</b>',
    translation: '危险',
    mediaId: null,
    positionSec: null,
    series: null,
    episode: null,
  },
];

describe('exportVocabToAnki', () => {
  it('creates the tanku Anime deck and model, then adds only new notes', async () => {
    const calls: { action: string; params: any }[] = [];
    const invoke: AnkiInvoke = async (action, params = {}) => {
      calls.push({ action, params });
      if (action === 'modelNames') return [] as any;
      if (action === 'canAddNotes') return [true, false] as any;
      if (action === 'addNotes') return [123] as any;
      return 1 as any;
    };

    const result = await exportVocabToAnki(rows, invoke);

    expect(result).toEqual({ deck: ANKI_DECK_NAME, added: 1, skipped: 1, total: 2 });
    expect(calls.map((call) => call.action)).toEqual([
      'createDeck', 'modelNames', 'createModel', 'canAddNotes', 'addNotes',
    ]);
    expect(calls[0].params).toEqual({ deck: ANKI_DECK_NAME });
    expect(calls[2].params).toMatchObject({
      modelName: ANKI_MODEL_NAME,
      inOrderFields: ['Key', 'Front', 'Back'],
    });

    const candidates = calls[3].params.notes;
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      deckName: ANKI_DECK_NAME,
      modelName: ANKI_MODEL_NAME,
      fields: { Front: '食べる' },
      tags: ['tanku-anime', 'word'],
    });
    expect(candidates[0].fields.Key).toMatch(/^[a-f0-9]{64}$/);
    expect(candidates[0].fields.Back).toContain('たべる');
    expect(candidates[0].fields.Back).toContain('食べたら帰ろうか');
    expect(candidates[0].fields.Back).toContain('Frieren 第3話');
    expect(candidates[0].fields.Back).toContain('http://localhost:5173/player/1?t=17.5');
    expect(candidates[1].fields.Front).toBe('&lt;b&gt;危ない&lt;/b&gt;');
    expect(calls[4].params.notes).toEqual([candidates[0]]);
  });

  it('reuses the existing model and skips addNotes when everything is already present', async () => {
    const actions: string[] = [];
    const invoke: AnkiInvoke = async (action) => {
      actions.push(action);
      if (action === 'modelNames') return [ANKI_MODEL_NAME] as any;
      if (action === 'canAddNotes') return [false, false] as any;
      return 1 as any;
    };

    await expect(exportVocabToAnki(rows, invoke)).resolves.toEqual({
      deck: ANKI_DECK_NAME,
      added: 0,
      skipped: 2,
      total: 2,
    });
    expect(actions).toEqual(['createDeck', 'modelNames', 'canAddNotes']);
  });
});

describe('createAnkiInvoke', () => {
  it('sends AnkiConnect API version 6 requests and unwraps the result', async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ result: ['Default'], error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await createAnkiInvoke(fetchFn as typeof fetch)<string[]>('deckNames');

    expect(result).toEqual(['Default']);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765');
    expect(JSON.parse(String(options?.body))).toEqual({ action: 'deckNames', version: 6, params: {} });
  });

  it('reports a connection failure as unavailable', async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => { throw new TypeError('connection refused'); });
    await expect(createAnkiInvoke(fetchFn as typeof fetch)('version')).rejects.toBeInstanceOf(
      AnkiConnectUnavailableError,
    );
  });
});
