import type { CatalogDrama } from '../types';

/** 放送年だけを見せる。厳選リストは放送日を持つが、一覧では年で足りる */
export function airYearLabel(startDate: string | null): string {
  const year = startDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? `${year}年` : '';
}

/** Bangumi の 0–10 評価。0 や未評価は「評価なし」（アニメ側の 0–100 とは別物） */
export function dramaScoreLabel(score: number | null): string {
  return score ? score.toFixed(1) : '評価なし';
}

/** カードの副行。「2018年 · 10話 · TBSテレビ」のように、あるものだけ並べる */
export function dramaCardMeta(drama: CatalogDrama): string {
  return [
    airYearLabel(drama.startDate),
    drama.episodes ? `${drama.episodes}話` : '',
    drama.network ?? '',
  ].filter(Boolean).join(' · ');
}

/** 厳選（/drama/:id）と Bangumi（/drama/bgm/:id）は id の名前空間が違うのでパスも分ける */
export function dramaDetailPath(drama: Pick<CatalogDrama, 'source' | 'id'>): string {
  return drama.source === 'bangumi' ? `/drama/bgm/${drama.id}` : `/drama/${drama.id}`;
}
