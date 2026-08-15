/** 放送年だけを見せる。厳選リストは放送日を持つが、一覧では年で足りる */
export function airYearLabel(startDate: string | null): string {
  const year = startDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? `${year}年` : '';
}
