import type { MediaItem } from '../types.js';

export interface MediaGroup {
  folder: string;
  items: MediaItem[];
}

export function groupMediaByFolder(items: MediaItem[]): MediaGroup[] {
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const group = groups.get(item.folder);
    if (group) group.push(item);
    else groups.set(item.folder, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ja'))
    .map(([folder, groupItems]) => ({ folder, items: groupItems }));
}

export function toggleCollapsedFolder(collapsedFolders: ReadonlySet<string>, folder: string): Set<string> {
  const next = new Set(collapsedFolders);
  if (next.has(folder)) next.delete(folder);
  else next.add(folder);
  return next;
}
