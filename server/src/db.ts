import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

export function createDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series TEXT NOT NULL,
      episode REAL,
      file_path TEXT NOT NULL UNIQUE,
      playable_path TEXT,
      codec_status TEXT NOT NULL DEFAULT 'unknown', -- direct | remuxed | transcode_needed | unknown
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subtitle_file (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL REFERENCES media(id),
      file_path TEXT NOT NULL,
      format TEXT NOT NULL,           -- srt | ass
      offset_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS progress (
      media_id INTEGER PRIMARY KEY REFERENCES media(id),
      position_sec REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS explain_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence_hash TEXT NOT NULL UNIQUE,
      sentence_text TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jimaku_mapping (
      series TEXT PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      entry_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dict (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kanji TEXT,
      kana TEXT NOT NULL,
      gloss TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dict_kanji ON dict(kanji);
    CREATE INDEX IF NOT EXISTS idx_dict_kana ON dict(kana);
  `);
  return db;
}

export function getSetting(db: Db, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}
