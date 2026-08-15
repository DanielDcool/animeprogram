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
  if (state === 'error') {
    return '候補を取得できませんでした。このアプリのサーバーが nyaa.si に届いていない可能性があります'
      + '（ブラウザで nyaa.si が開けても、サーバーはシステムのプロキシを使いません）。'
      + 'Nyaa のサイトで直接検索することもできます。';
  }
  return '検索ボタンを押すと、Nyaa の候補をこのページに表示します。';
}

/**
 * 取得失敗時の対処ヒント。国内など nyaa.si に直結できない環境では、
 * Node 22.21 以降の NODE_USE_ENV_PROXY でサーバー側の fetch をプロキシ経由にできる。
 * reason はサーバーが返した上流エラー（例: fetch failed (ENOTFOUND)）で、問い合わせ時の手掛かりになる。
 */
export function resourceErrorHint(reason: string | undefined): string {
  const fix = 'プロキシが必要な環境では、NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 npm start '
    + 'のように設定して起動し直してください（Node 22.21 以降。ポートはお使いのプロキシに合わせる）。';
  return reason ? `${fix} 詳細: ${reason}` : fix;
}
