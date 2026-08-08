import { describe, expect, it } from 'vitest';
import type { MediaItem, SubtitleStatus } from '../src/types.js';
import { countNeedsMapping, subtitleAction } from '../src/library/subtitleView.js';

function item(subtitleStatus: SubtitleStatus): MediaItem {
  return {
    id: 1,
    folder: 'AnimeLibrary',
    series: 'Show',
    episode: 1,
    codecStatus: 'direct',
    playable: true,
    hasSubtitle: subtitleStatus === 'ready',
    positionSec: 0,
    subtitleStatus,
    subtitleError: subtitleStatus === 'failed' ? '失敗しました' : null,
  };
}

describe('library subtitle presentation', () => {
  it('counts only media that need a one-time Jimaku mapping', () => {
    expect(countNeedsMapping([
      item('ready'), item('needs_mapping'), item('downloading'), item('failed'),
    ])).toBe(1);
  });

  it('uses a distinct action for every subtitle state', () => {
    expect(subtitleAction(item('needs_mapping'))).toEqual({ label: '字幕を探す', disabled: false });
    expect(subtitleAction(item('downloading'))).toEqual({ label: '字幕を取得中…', disabled: true });
    expect(subtitleAction(item('failed'))).toEqual({ label: '再試行', disabled: false });
    expect(subtitleAction(item('ready'))).toEqual({ label: '↺ 字幕', disabled: false });
  });
});
