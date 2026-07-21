import type { Db } from '../../db.js';

export interface DictEntry {
  kanji: string[];
  kana: string[];
  gloss: string[];
}

export function insertEntry(db: Db, entry: DictEntry): void {
  const gloss = entry.gloss.join('; ');
  const stmt = db.prepare('INSERT INTO dict (kanji, kana, gloss) VALUES (?,?,?)');
  const kana = entry.kana[0] ?? '';
  if (entry.kanji.length === 0) {
    stmt.run(null, kana, gloss);
  } else {
    for (const k of entry.kanji) stmt.run(k, kana, gloss);
  }
}

export interface LookupResult { word: string; kana: string; gloss: string }

export function lookup(db: Db, term: string, limit = 5): LookupResult[] {
  const rows = db.prepare(
    `SELECT COALESCE(kanji, kana) AS word, kana, gloss FROM dict WHERE kanji = ? OR kana = ? LIMIT ?`,
  ).all(term, term, limit) as LookupResult[];
  return rows;
}
