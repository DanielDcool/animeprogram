import type { MediaItem } from '../types.js';

export function countNeedsMapping(items: MediaItem[]): number {
  return items.filter((item) => item.subtitleStatus === 'needs_mapping').length;
}

export function subtitleAction(item: MediaItem): { label: string; disabled: boolean } {
  switch (item.subtitleStatus) {
    case 'needs_mapping': return { label: '字幕を探す', disabled: false };
    case 'downloading': return { label: '字幕を取得中…', disabled: true };
    case 'failed': return { label: '再試行', disabled: false };
    case 'ready': return { label: '↺ 字幕', disabled: false };
  }
}
