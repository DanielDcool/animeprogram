import { unzipSync } from 'fflate';

// DEVELOPMENT.md の導入基線で検証済みの JMdict Simplified リリース。
export const DEFAULT_JMDICT_TAG = '3.6.2+20260720135044';

const RELEASE_API_BASE = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export function releaseApiUrl(tag: string | null): string {
  return tag == null
    ? `${RELEASE_API_BASE}/latest`
    : `${RELEASE_API_BASE}/tags/${encodeURIComponent(tag)}`;
}

export function pickJmdictAsset(assets: ReleaseAsset[]): ReleaseAsset {
  const match = assets.find((asset) => /^jmdict-eng-\d.*\.json\.zip$/.test(asset.name));
  if (!match) {
    throw new Error(
      `Could not find a full English "jmdict-eng-*.json.zip" asset in this release. Assets: ${assets
        .map((asset) => asset.name)
        .join(', ')}`,
    );
  }
  return match;
}

export function pickZipJsonEntry(names: string[]): string {
  const jsonEntries = names.filter((name) => !name.endsWith('/') && name.endsWith('.json'));
  if (jsonEntries.length === 0) {
    throw new Error(`The archive holds no .json file. Entries: ${names.join(', ')}`);
  }
  return jsonEntries.find((name) => name.startsWith('jmdict')) ?? jsonEntries[0];
}

export function extractJmdictJson(zipData: Uint8Array): { name: string; data: Uint8Array } {
  const entries = unzipSync(zipData);
  const name = pickZipJsonEntry(Object.keys(entries));
  return { name, data: entries[name] };
}
