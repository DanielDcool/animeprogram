// アニメ / ドラマ の表示モード。
// localStorage に保存する「利用者が選んだモード」と、
// 実際に <html data-mode> へ書き込む「有効モード」を分けて扱う。
export type ContentMode = 'anime' | 'drama';

export const DEFAULT_CONTENT_MODE: ContentMode = 'anime';
export const MODE_STORAGE_KEY = 'tanku.contentMode';

export function normalizeStoredMode(value: string | null): ContentMode {
  return value === 'drama' || value === 'anime' ? value : DEFAULT_CONTENT_MODE;
}

/**
 * 播放ページは「観る」画面なので、ドラマモードでも常に墨黑を保つ。
 * 明るい面は映像のコントラストを下げ、解析パネルの「唯一の明るい面」原則も崩れるため。
 */
export function effectiveMode(mode: ContentMode, pathname: string): ContentMode {
  return pathname.startsWith('/play/') ? 'anime' : mode;
}
