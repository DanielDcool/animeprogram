import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';

interface SavePayload {
  kind: 'word' | 'sentence';
  word?: string;
  reading?: string;
  gloss?: string;
  sentence: string;
  translation?: string;
  mediaId?: number;
  positionSec?: number;
}

export async function vocabRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.post<{ Body: SavePayload }>('/api/vocab', async (req, reply) => {
    const b = req.body;
    if (!b?.sentence || (b.kind !== 'word' && b.kind !== 'sentence')) {
      return reply.code(400).send({ error: 'kind and sentence required' });
    }
    const info = db.prepare(`
      INSERT OR IGNORE INTO vocab (kind, word, reading, gloss, sentence, translation, media_id, position_sec)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      b.kind, b.word ?? null, b.reading ?? null, b.gloss ?? null,
      b.sentence, b.translation ?? null, b.mediaId ?? null, b.positionSec ?? null,
    );
    return { saved: info.changes > 0 };
  });

  app.get('/api/vocab', async () => {
    return db.prepare(`
      SELECT v.id, v.kind, v.word, v.reading, v.gloss, v.sentence, v.translation,
             v.position_sec AS positionSec, v.created_at AS createdAt,
             m.series, m.episode, m.id AS mediaId
      FROM vocab v LEFT JOIN media m ON m.id = v.media_id
      ORDER BY v.id DESC
    `).all();
  });

  app.get<{ Params: { id: string } }>('/api/vocab/:id', async (req, reply) => {
    const item = db.prepare(`
      SELECT v.id, v.kind, v.word, v.reading, v.gloss, v.sentence, v.translation,
             v.position_sec AS positionSec, v.created_at AS createdAt,
             m.series, m.episode, m.id AS mediaId
      FROM vocab v LEFT JOIN media m ON m.id = v.media_id
      WHERE v.id = ?
    `).get(req.params.id) as any;
    if (!item) return reply.code(404).send({ error: 'not found' });

    const cached = db.prepare(`
      SELECT response_json FROM explain_cache
      WHERE sentence_text = ?
      ORDER BY id DESC LIMIT 1
    `).get(item.sentence.trim()) as { response_json: string } | undefined;
    let aiExplanation = null;
    if (cached) {
      try { aiExplanation = JSON.parse(cached.response_json); } catch { /* ignore invalid local cache */ }
    }
    return { ...item, aiExplanation };
  });

  app.delete<{ Params: { id: string } }>('/api/vocab/:id', async (req, reply) => {
    const info = db.prepare('DELETE FROM vocab WHERE id=?').run(req.params.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  // Anki 取り込み用 TSV（front<TAB>back、改行は <br>）
  app.get('/api/vocab/export.tsv', async (_req, reply) => {
    const rows = db.prepare('SELECT * FROM vocab ORDER BY id').all() as any[];
    const esc = (s: string) => s.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
    const lines = rows.map((r) => {
      if (r.kind === 'word') {
        const back = [r.reading, r.gloss, r.sentence ? `例: ${r.sentence}` : null].filter(Boolean).join('<br>');
        return `${esc(r.word ?? '')}\t${esc(back)}`;
      }
      return `${esc(r.sentence)}\t${esc(r.translation ?? '')}`;
    });
    reply
      .header('content-type', 'text/tab-separated-values; charset=utf-8')
      .header('content-disposition', 'attachment; filename="vocab.tsv"');
    return lines.join('\n') + '\n';
  });
}
