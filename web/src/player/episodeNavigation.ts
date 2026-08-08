import type { MediaItem } from '../types';

export interface EpisodeNavigation {
  items: MediaItem[];
  currentIndex: number;
  previous: MediaItem | null;
  next: MediaItem | null;
}

export function episodeNavigation(allItems: MediaItem[], currentId: number): EpisodeNavigation {
  const current = allItems.find((item) => item.id === currentId);
  if (!current) return { items: [], currentIndex: -1, previous: null, next: null };

  const items = allItems
    .filter((item) => item.folder === current.folder && item.playable)
    .sort((a, b) => {
      const seriesOrder = a.series.localeCompare(b.series, 'ja');
      if (seriesOrder !== 0) return seriesOrder;
      if (a.episode == null && b.episode != null) return 1;
      if (a.episode != null && b.episode == null) return -1;
      return (a.episode ?? 0) - (b.episode ?? 0) || a.id - b.id;
    });
  const currentIndex = items.findIndex((item) => item.id === currentId);

  return {
    items,
    currentIndex,
    previous: currentIndex > 0 ? items[currentIndex - 1] : null,
    next: currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : null,
  };
}
