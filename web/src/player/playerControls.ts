// 自前の再生コントロール用の純粋ロジック（時刻表示・シーク計算）。
// 学習プレイヤーはネイティブコントロールに頼らず、常時表示のシークバーを自前で描く。

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

export function seekTimeFromFraction(fraction: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const f = Math.min(1, Math.max(0, fraction));
  return f * duration;
}

export function progressFraction(current: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(current) || current <= 0) return 0;
  return Math.min(1, current / duration);
}
