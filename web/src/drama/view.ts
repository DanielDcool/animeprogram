import type { SeasonRef } from '../types';

const COUR_MONTH = { WINTER: 1, SPRING: 4, SUMMER: 7, FALL: 10 } as const;

/** ドラマは「2026年 7月期」と数える（アニメの「7月新番」とは言い方が違う） */
export function courLabel(ref: SeasonRef): string {
  return `${ref.year}年 ${COUR_MONTH[ref.season]}月期`;
}

export function networkLabel(network: string | null): string {
  return network ?? '放送局不明';
}

export function airYearLabel(startDate: string | null): string {
  const year = startDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? `${year}年` : '';
}
