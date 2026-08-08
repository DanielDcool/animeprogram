import { describe, expect, it } from 'vitest';
import { episodeNavigation } from '../src/player/episodeNavigation.js';
import type { MediaItem } from '../src/types.js';

function item(
  id: number,
  folder: string,
  series: string,
  episode: number | null,
  playable = true,
): MediaItem {
  return {
    id,
    folder,
    series,
    episode,
    codecStatus: playable ? 'direct' : 'unsupported',
    playable,
    hasSubtitle: true,
    positionSec: 0,
    subtitleStatus: 'ready',
    subtitleError: null,
  };
}

describe('episodeNavigation', () => {
  it('keeps playable videos from the current physical folder in episode order', () => {
    const navigation = episodeNavigation([
      item(3, 'Frieren', 'Frieren', 3),
      item(9, 'Other', 'Other', 1),
      item(2, 'Frieren', 'Frieren', 2),
      item(4, 'Frieren', 'Frieren', 4, false),
      item(1, 'Frieren', 'Frieren', 1),
    ], 2);

    expect(navigation.items.map((media) => media.id)).toEqual([1, 2, 3]);
    expect(navigation.currentIndex).toBe(1);
    expect(navigation.previous?.id).toBe(1);
    expect(navigation.next?.id).toBe(3);
  });

  it('uses title order as a stable fallback and stops at either end', () => {
    const items = [
      item(1, 'Mixed', 'Beta', null),
      item(2, 'Mixed', 'Alpha', null),
    ];

    const first = episodeNavigation(items, 2);
    const last = episodeNavigation(items, 1);

    expect(first.items.map((media) => media.id)).toEqual([2, 1]);
    expect(first.previous).toBeNull();
    expect(first.next?.id).toBe(1);
    expect(last.previous?.id).toBe(2);
    expect(last.next).toBeNull();
  });
});
