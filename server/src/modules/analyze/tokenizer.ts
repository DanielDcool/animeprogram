import kuromoji from 'kuromoji';
import path from 'node:path';
import { createRequire } from 'node:module';

export interface JaToken {
  surface: string;
  base: string;      // 辞書形
  reading: string;   // ひらがな
  pos: string;       // 品詞大分類
  posDetail: string;
}

const require = createRequire(import.meta.url);
const DIC_DIR = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');

let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

function getTokenizer() {
  tokenizerPromise ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DIC_DIR }).build((err, tk) => (err ? reject(err) : resolve(tk)));
  });
  return tokenizerPromise;
}

function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export async function tokenize(text: string): Promise<JaToken[]> {
  const tk = await getTokenizer();
  return tk.tokenize(text).map((t) => ({
    surface: t.surface_form,
    base: t.basic_form === '*' ? t.surface_form : t.basic_form,
    reading: t.reading ? kataToHira(t.reading) : t.surface_form,
    pos: t.pos,
    posDetail: [t.pos_detail_1, t.conjugated_form].filter((x) => x && x !== '*').join('・'),
  }));
}
