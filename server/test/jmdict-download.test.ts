import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JMDICT_TAG,
  extractJmdictJson,
  pickJmdictAsset,
  pickZipJsonEntry,
  releaseApiUrl,
} from '../src/modules/analyze/jmdict-download.js';

const asset = (name: string) => ({
  name,
  browser_download_url: `https://example.com/${name}`,
});

describe('releaseApiUrl', () => {
  it('builds an encoded tag URL', () => {
    expect(releaseApiUrl('3.6.2+20260720135044')).toBe(
      'https://api.github.com/repos/scriptin/jmdict-simplified/releases/tags/3.6.2%2B20260720135044',
    );
  });

  it('builds the latest-release URL when no tag is given', () => {
    expect(releaseApiUrl(null)).toBe(
      'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest',
    );
  });

  it('pins a known-good default tag', () => {
    expect(DEFAULT_JMDICT_TAG).toMatch(/^\d+\.\d+\.\d+\+\d+$/);
  });
});

describe('pickJmdictAsset', () => {
  it('picks the full English json.zip among other release assets', () => {
    const wanted = asset('jmdict-eng-3.6.2+20260720135044.json.zip');
    const picked = pickJmdictAsset([
      asset('jmdict-all-3.6.2+20260720135044.json.zip'),
      asset('jmdict-eng-common-3.6.2+20260720135044.json.zip'),
      wanted,
      asset('jmnedict-all-3.6.2+20260720135044.json.zip'),
      asset('kanjidic2-en-3.6.2+20260720135044.json.zip'),
      asset('checksums.sha256'),
    ]);
    expect(picked).toEqual(wanted);
  });

  it('throws an informative error when the full English edition is missing', () => {
    expect(() =>
      pickJmdictAsset([
        asset('jmdict-eng-common-3.6.2+20260720135044.json.zip'),
        asset('jmnedict-all-3.6.2+20260720135044.json.zip'),
      ]),
    ).toThrow(/jmdict-eng-.*\.json\.zip/);
  });
});

describe('pickZipJsonEntry', () => {
  it('returns the single json entry', () => {
    expect(pickZipJsonEntry(['jmdict-eng-3.6.2.json'])).toBe('jmdict-eng-3.6.2.json');
  });

  it('prefers the jmdict entry when several json files exist', () => {
    expect(pickZipJsonEntry(['README.json', 'jmdict-eng-3.6.2.json'])).toBe(
      'jmdict-eng-3.6.2.json',
    );
  });

  it('throws when the archive holds no json file', () => {
    expect(() => pickZipJsonEntry(['README.txt'])).toThrow(/no .*json/i);
  });
});

describe('extractJmdictJson', () => {
  it('extracts the dictionary json from a zip buffer', () => {
    const content = JSON.stringify({ words: [] });
    const zip = zipSync({ 'jmdict-eng-3.6.2.json': strToU8(content) });
    const extracted = extractJmdictJson(zip);
    expect(extracted.name).toBe('jmdict-eng-3.6.2.json');
    expect(Buffer.from(extracted.data).toString('utf8')).toBe(content);
  });

  it('ignores directory entries', () => {
    const zip = zipSync({
      'docs/': new Uint8Array(0),
      'jmdict-eng-3.6.2.json': strToU8('{"words":[]}'),
    });
    expect(extractJmdictJson(zip).name).toBe('jmdict-eng-3.6.2.json');
  });
});
