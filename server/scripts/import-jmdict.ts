// 使い方：
//   1. https://github.com/scriptin/jmdict-simplified/releases から jmdict-eng-3.x.x.json.zip をダウンロード
//   2. server/vendor/jmdict-eng.json に解凍
//   3. npm run import-jmdict -w server
import fs from 'node:fs';
import path from 'node:path';
import { createDb } from '../src/db.js';
import { importJmdict } from '../src/modules/analyze/jmdict-import.js';
import { config } from '../src/config.js';

const src = path.join(import.meta.dirname, '..', 'vendor', 'jmdict-eng.json');
if (!fs.existsSync(src)) {
  console.error(`missing ${src} — download jmdict-eng from jmdict-simplified releases first`);
  process.exit(1);
}

const db = createDb(path.join(config.dataDir, 'library.db'));
const count = await importJmdict(db, fs.createReadStream(src));
console.log(`imported ${count} entries`);
