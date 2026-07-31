import { describe, it, expect } from 'vitest';
import { createDb } from '../src/db.js';

describe('createDb', () => {
  it('creates all tables', () => {
    const db = createDb(':memory:');
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r: any) => r.name);
    for (const t of ['media', 'subtitle_file', 'progress', 'explain_cache', 'settings', 'dict', 'jimaku_mapping', 'subtitle_sync_state', 'vocab']) {
      expect(names).toContain(t);
    }
  });

  it('settings get/set roundtrip', () => {
    const db = createDb(':memory:');
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .run('anthropic_api_key', 'sk-test');
    const row: any = db.prepare(`SELECT value FROM settings WHERE key=?`).get('anthropic_api_key');
    expect(row.value).toBe('sk-test');
  });
});
