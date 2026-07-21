// 使い方：
//   1. https://github.com/scriptin/jmdict-simplified/releases から jmdict-eng-3.x.x.json.zip をダウンロード
//   2. server/vendor/jmdict-eng.json に解凍
//   3. npm run import-jmdict -w server
import fs from 'node:fs';
import path from 'node:path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick.js';
import { streamArray } from 'stream-json/streamers/StreamArray.js';
import { createDb } from '../src/db.js';
import { insertEntry } from '../src/modules/analyze/dictionary.js';
import { config } from '../src/config.js';

const src = path.join(import.meta.dirname, '..', 'vendor', 'jmdict-eng.json');
if (!fs.existsSync(src)) {
  console.error(`missing ${src} — download jmdict-eng from jmdict-simplified releases first`);
  process.exit(1);
}

const db = createDb(path.join(config.dataDir, 'library.db'));
db.exec('DELETE FROM dict');
let count = 0;

const pipeline = chain([
  fs.createReadStream(src),
  parser(),
  pick({ filter: 'words' }),
  streamArray(),
]);

const insertMany = db.transaction((entries: any[]) => {
  for (const e of entries) {
    insertEntry(db, {
      kanji: e.kanji.map((k: any) => k.text),
      kana: e.kana.map((k: any) => k.text),
      gloss: e.sense.flatMap((s: any) => s.gloss.map((g: any) => g.text)).slice(0, 6),
    });
  }
});

let batch: any[] = [];
pipeline.on('data', ({ value }: { value: any }) => {
  batch.push(value);
  if (batch.length >= 5000) { insertMany(batch); count += batch.length; batch = []; }
});
pipeline.on('end', () => {
  insertMany(batch); count += batch.length;
  console.log(`imported ${count} entries`);
});
