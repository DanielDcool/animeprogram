import type { SeasonRef } from '../types';

const SEASON_MONTH = {
  WINTER: 1,
  SPRING: 4,
  SUMMER: 7,
  FALL: 10,
} as const;

export function seasonLabel(ref: SeasonRef): string {
  return `${ref.year}年 ${SEASON_MONTH[ref.season]}月新番`;
}

export function statusLabel(status: string): string {
  if (status === 'RELEASING') return '放送中';
  if (status === 'FINISHED') return '放送終了';
  if (status === 'NOT_YET_RELEASED') return '放送予定';
  return '配信情報を確認';
}

export function scoreLabel(score: number | null): string {
  return score == null ? '評価なし' : `${score}%`;
}
