export const DEFAULT_PLAYER_WIDTH = 62;

const MIN_PLAYER_WIDTH = 40;
const MAX_PLAYER_WIDTH = 80;
const MIN_ANALYSIS_WIDTH_PX = 320;
const RESIZER_WIDTH_PX = 12;

function clampPlayerWidth(width: number, containerWidth: number): number {
  const availableMax = containerWidth > 0
    ? ((containerWidth - MIN_ANALYSIS_WIDTH_PX - RESIZER_WIDTH_PX) / containerWidth) * 100
    : MAX_PLAYER_WIDTH;
  const max = Math.max(MIN_PLAYER_WIDTH, Math.min(MAX_PLAYER_WIDTH, availableMax));
  return Math.round(Math.min(max, Math.max(MIN_PLAYER_WIDTH, width)) * 10) / 10;
}

export function normalizeStoredPlayerWidth(value: string | null): number {
  const parsed = Number(value);
  return value != null && Number.isFinite(parsed)
    ? clampPlayerWidth(parsed, 0)
    : DEFAULT_PLAYER_WIDTH;
}

export function playerWidthFromPointer(clientX: number, containerLeft: number, containerWidth: number): number {
  if (containerWidth <= 0) return DEFAULT_PLAYER_WIDTH;
  return clampPlayerWidth(((clientX - containerLeft) / containerWidth) * 100, containerWidth);
}

export function resizePlayerWidthByKey(
  currentWidth: number,
  key: string,
  containerWidth: number,
): number | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  return clampPlayerWidth(currentWidth + (key === 'ArrowLeft' ? -2 : 2), containerWidth);
}
