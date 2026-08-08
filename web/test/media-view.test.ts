import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../src/types.js';
import { groupMediaByFolder, toggleCollapsedFolder } from '../src/library/mediaView.js';

function item(id: number, folder: string): MediaItem {
  return {
    id,
    folder,
    series: `Show ${id}`,
    episode: id,
    codecStatus: 'direct',
    playable: true,
    hasSubtitle: true,
    positionSec: 0,
    subtitleStatus: 'ready',
    subtitleError: null,
  };
}

describe('library media grouping', () => {
  it('groups media by physical folder and sorts the groups by name', () => {
    const groups = groupMediaByFolder([
      item(1, 'Season 2'),
      item(2, 'Season 1'),
      item(3, 'Season 2'),
    ]);

    expect(groups.map((group) => group.folder)).toEqual(['Season 1', 'Season 2']);
    expect(groups[1].items.map((media) => media.id)).toEqual([1, 3]);
  });

  it('toggles one folder without changing the other collapsed folders', () => {
    const initial = new Set(['Season 1']);

    const collapsed = toggleCollapsedFolder(initial, 'Season 2');
    const expandedAgain = toggleCollapsedFolder(collapsed, 'Season 1');

    expect([...collapsed]).toEqual(['Season 1', 'Season 2']);
    expect([...expandedAgain]).toEqual(['Season 2']);
    expect([...initial]).toEqual(['Season 1']);
  });
});
