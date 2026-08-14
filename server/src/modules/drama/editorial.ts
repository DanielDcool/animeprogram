import type { CatalogDrama } from './client.js';

export interface DramaEditorialNote {
  badge: string;
  reason: string;
}

export interface DramaPick extends DramaEditorialNote {
  tmdbId: number;
  title: string;
  /** TMDB の CDN を直接参照する。画像ファイルはリポジトリに置かない（版権素材のため） */
  posterUrl: string | null;
  firstAirDate: string | null;
}

// 日本語学習の切り口で選んだ手書きリスト。TMDB のランキングの写しではない。
// tmdbId は TMDB の公開ページで 1 件ずつ確認済み（2026-08-14）。推測値ではない。
// posterUrl は scripts/resolve-drama-picks.ts で後から埋める（null のままでも動く）。
export const DRAMA_PICKS: DramaPick[] = [
  {
    tmdbId: 67504,
    title: '重版出来!',
    posterUrl: null,
    firstAirDate: '2016-04-12',
    badge: '仕事の日本語',
    reason: '出版社が舞台。敬語、報連相、会議での言い回しが自然な文脈で何度も出てくる。',
  },
  {
    tmdbId: 210444,
    title: 'silent',
    posterUrl: null,
    firstAirDate: '2022-10-06',
    badge: 'まず一本目',
    reason: '現代の日常会話が中心で話す速度もゆっくりめ。短い自然な表現を拾いやすい。',
  },
  {
    tmdbId: 75701,
    title: 'アンナチュラル',
    posterUrl: null,
    firstAirDate: '2018-01-12',
    badge: '挑戦する一本',
    reason: '法医学の専門語彙とテンポの速い会話。N1 の先へ語彙を伸ばしたいときに。',
  },
  {
    tmdbId: 68293,
    title: '逃げるは恥だが役に立つ',
    posterUrl: null,
    firstAirDate: '2016-10-11',
    badge: '暮らしと仕事',
    reason: '家事と労働の話が軸。生活語彙と職場語彙の両方を一本で拾える。',
  },
  {
    tmdbId: 69857,
    title: 'カルテット',
    posterUrl: null,
    firstAirDate: '2017-01-17',
    badge: '会話劇の名作',
    reason: '含みのある言い回しと間の取り方が濃い。行間を聞き取る練習になる。',
  },
  {
    tmdbId: 55925,
    title: '半沢直樹',
    posterUrl: null,
    firstAirDate: '2013-07-07',
    badge: '硬い敬語',
    reason: '銀行が舞台で、交渉と謝罪の場面が多い。かたい敬語をまとめて浴びられる。',
  },
  {
    tmdbId: 89613,
    title: 'きのう何食べた？',
    posterUrl: null,
    firstAirDate: '2019-04-06',
    badge: '生活の語彙',
    reason: '買い物と料理の描写が細かい。値段、食材、分量など毎日使う言葉が並ぶ。',
  },
  {
    tmdbId: 88646,
    title: 'わたし、定時で帰ります。',
    posterUrl: null,
    firstAirDate: '2019-04-16',
    badge: '働き方',
    reason: '残業と役割分担が主題。職場の断り方や調整の言い方が具体的に出てくる。',
  },
];

const NOTES = new Map(DRAMA_PICKS.map((pick) => [pick.tmdbId, pick]));

export function dramaEditorialNote(id: number): DramaEditorialNote | undefined {
  const pick = NOTES.get(id);
  return pick ? { badge: pick.badge, reason: pick.reason } : undefined;
}

/** TMDB トークンが無くても表示できる、カタログ形状のエントリ */
export function dramaFeatured(): CatalogDrama[] {
  return DRAMA_PICKS.map((pick) => ({
    id: pick.tmdbId,
    title: pick.title,
    titleEnglish: null,
    titleNative: pick.title,
    coverImage: pick.posterUrl,
    bannerImage: null,
    description: '',
    score: null,
    episodes: null,
    status: 'FINISHED',
    startDate: pick.firstAirDate,
    network: null,
    links: [],
    recommendation: { badge: pick.badge, reason: pick.reason },
  }));
}
