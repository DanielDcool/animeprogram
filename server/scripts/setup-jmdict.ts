// JMdict を一括セットアップ：
//   npm run setup:jmdict            … 検証済みリリースを取得して導入
//   npm run setup:jmdict -- --latest（最新リリース） / --tag <tag> / --force（再ダウンロード）
// ネットワークが使えない場合は README の手動手順（import-jmdict）が代替経路。
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import {
  DEFAULT_JMDICT_TAG,
  extractJmdictJson,
  pickJmdictAsset,
  releaseApiUrl,
} from '../src/modules/analyze/jmdict-download.js';
import { importJmdict } from '../src/modules/analyze/jmdict-import.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const latest = args.includes('--latest');
const tagFlagIndex = args.indexOf('--tag');
const tag = latest
  ? null
  : tagFlagIndex >= 0
    ? args[tagFlagIndex + 1]
    : process.env.JMDICT_TAG?.trim() || DEFAULT_JMDICT_TAG;

const vendorDir = process.env.JMDICT_VENDOR_DIR?.trim() || path.join(import.meta.dirname, '..', 'vendor');
const target = path.join(vendorDir, 'jmdict-eng.json');

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'tanku-anime-setup-jmdict', Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response;
}

async function downloadDictionary(): Promise<void> {
  const url = releaseApiUrl(tag ?? null);
  console.log(`Fetching release metadata: ${url}`);
  const release = (await fetchOk(url).then((r) => r.json())) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const asset = pickJmdictAsset(release.assets);
  console.log(`Downloading ${asset.name} (release ${release.tag_name}) ...`);
  const zipBuffer = (await fetchOk(asset.browser_download_url).then((r) => r.arrayBuffer())) as ArrayBuffer;
  const zipData = new Uint8Array(zipBuffer);
  console.log(`Downloaded ${(zipData.byteLength / 1024 / 1024).toFixed(1)} MiB, extracting ...`);
  const { name, data } = extractJmdictJson(zipData);
  fs.mkdirSync(vendorDir, { recursive: true });
  const tempPath = `${target}.download`;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, target);
  console.log(`Extracted ${name} to ${target}`);
}

try {
  if (fs.existsSync(target) && !force) {
    console.log(`Reusing existing ${target} (pass --force to re-download).`);
  } else {
    await downloadDictionary();
  }

  const db = createDb(path.join(config.dataDir, 'library.db'));
  console.log('Importing into the local dictionary database ...');
  const count = await importJmdict(db, fs.createReadStream(target));
  console.log(`Imported ${count} JMdict entries.`);
  console.log(
    'Dictionary data: JMdict, property of the EDRDG (https://www.edrdg.org/), CC BY-SA 4.0, via JMdict Simplified (https://github.com/scriptin/jmdict-simplified).',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    'Automatic setup failed. Manual fallback: download a jmdict-eng-*.json.zip release from https://github.com/scriptin/jmdict-simplified/releases, extract it to server/vendor/jmdict-eng.json, then run "npm run import-jmdict -w server".',
  );
  process.exit(1);
}
