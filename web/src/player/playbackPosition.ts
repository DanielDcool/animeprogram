export function playbackUrl(mediaId: number, positionSec: number | null): string {
  if (positionSec == null || !Number.isFinite(positionSec) || positionSec < 0) return `/play/${mediaId}`;
  const rounded = Math.round(positionSec * 1000) / 1000;
  return `/play/${mediaId}?t=${rounded}`;
}

export function linkedPlaybackPosition(search: string): number | null {
  const raw = new URLSearchParams(search).get('t');
  if (raw == null || raw === '') return null;
  const position = Number(raw);
  return Number.isFinite(position) && position >= 0 ? position : null;
}

export function playbackStartPosition(search: string, savedPositionSec: number): number {
  return linkedPlaybackPosition(search)
    ?? (Number.isFinite(savedPositionSec) && savedPositionSec > 0 ? savedPositionSec : 0);
}
