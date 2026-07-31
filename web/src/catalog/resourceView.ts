import type { ResourceResult } from '../types';

type ResourceMeta = Pick<
ResourceResult,
'releaseGroup' | 'resolution' | 'codec' | 'size' | 'seeders' | 'needsTranscode' | 'publishedAt'
>;

export type ResourceViewState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export function resourceMetaLabels(resource: ResourceMeta): string[] {
  return [
    resource.releaseGroup,
    resource.resolution,
    resource.codec === 'unknown' ? null : resource.codec,
    resource.size || null,
    `シード ${resource.seeders}`,
    resource.publishedAt?.slice(0, 10) ?? null,
  ].filter((label): label is string => Boolean(label));
}

export function compatibilityMessage(resource: Pick<ResourceResult, 'needsTranscode'>): string | null {
  return resource.needsTranscode
    ? 'ブラウザ再生には変換が必要な場合があります。'
    : null;
}

export function resourceStateCopy(state: Exclude<ResourceViewState, 'ready'>): string {
  if (state === 'loading') return 'ダウンロード候補を取得しています…';
  if (state === 'empty') return '候補が見つかりませんでした。検索条件を変えるか、Nyaa で確認してください。';
  if (state === 'error') return '候補を取得できませんでした。Nyaa のサイトで検索できます。';
  return '検索ボタンを押すと、Nyaa の候補をこのページに表示します。';
}
