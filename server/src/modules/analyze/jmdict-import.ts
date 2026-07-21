import type { Readable } from 'node:stream';
import chain from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamArray } from 'stream-json/streamers/stream-array.js';
import type { Db } from '../../db.js';
import { insertEntry } from './dictionary.js';

export function importJmdict(db: Db, source: Readable): Promise<number> {
  db.exec('DELETE FROM dict');
  const insertMany = db.transaction((entries: any[]) => {
    for (const entry of entries) {
      insertEntry(db, {
        kanji: entry.kanji.map((item: any) => item.text),
        kana: entry.kana.map((item: any) => item.text),
        gloss: entry.sense.flatMap((sense: any) => sense.gloss.map((item: any) => item.text)).slice(0, 6),
      });
    }
  });

  const pipeline = chain([
    source,
    parser(),
    pick({ filter: 'words' }),
    streamArray(),
  ]);

  return new Promise((resolve, reject) => {
    let count = 0;
    let batch: any[] = [];

    const flush = () => {
      insertMany(batch);
      count += batch.length;
      batch = [];
    };

    pipeline.on('data', ({ value }: { value: any }) => {
      batch.push(value);
      if (batch.length >= 5000) flush();
    });
    pipeline.on('end', () => {
      flush();
      resolve(count);
    });
    pipeline.on('error', reject);
  });
}
