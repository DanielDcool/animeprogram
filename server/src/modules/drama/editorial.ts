import type { CatalogDrama } from './client.js';

/** 目安の難易度。JLPT のレベルそのものではなく「聞き取りの重さ」の目安 */
export type DramaLevel = 'N3' | 'N2' | 'N1' | 'N1+';

export interface DramaEditorialNote {
  badge: string;
  reason: string;
}

export interface DramaPick extends DramaEditorialNote {
  tmdbId: number;
  title: string;
  /**
   * リリース側で使われるローマ字表記。Nyaa の実写カテゴリでは日本語原題より
   * ローマ字の方が圧倒的に当たる（2026-08-15 実測: アンナチュラル 0 件に対し
   * Unnatural 20 件、きのう何食べた 0 件に対し What Did You Eat Yesterday 4 件）。
   * 公式英題ではなく「原題のローマ字転写」が当たる点に注意
   * （We Married as a Job 0 件 / Nigeru wa Haji da ga Yaku ni Tatsu 29 件）。
   * 原題と同じ綴りなら null。
   */
  titleRomaji: string | null;
  level: DramaLevel;
  /** TMDB の CDN を直接参照する。画像ファイルはリポジトリに置かない（版権素材のため） */
  posterUrl: string | null;
  /** 横長スロット用の背景。縦長ポスターでは横幅が埋まらないので別に持つ */
  backdropUrl: string | null;
  firstAirDate: string | null;
}

// 日本語学習の切り口で選んだ手書きリスト。TMDB のランキングの写しではない。
// tmdbId は TMDB の公開ページで 1 件ずつ確認済み（2026-08-15）。推測値は 1 つも無い。
// posterUrl / backdropUrl は TMDB の公開ページから取得した画像パスで、トークンは要らない。
// 保存するのは URL 文字列だけで、画像ファイル自体はリポジトリに入れない（版権素材のため）。
// 取得できなければ null のままでよく、その場合は --stripe-cover の地紋にフォールバックする。
//
// 注意（同名・別作品の罠）:
//   - GTO は TMDB 検索でアニメ版 43017 が上位に来る。実写 1998 年版は 62057。
//   - ドラゴン桜 2021 と VIVANT S2 は TMDB 上で独立 ID を持たず S1 の ID 配下の
//     シーズン 2 として扱われる。ここでは 1 作品 1 行とし、シーズンは扱わない。
//   - 孤独のグルメ は配信版・台湾版など紛らわしい別 ID が複数ある。本編は 55582。
export const DRAMA_PICKS: DramaPick[] = [
  // ---- N3 前後: 日常会話が中心、話速もつかみやすい ----
  {
    tmdbId: 68293,
    title: '逃げるは恥だが役に立つ',
    titleRomaji: 'Nigeru wa Haji da ga Yaku ni Tatsu',
    level: 'N3',
    posterUrl: 'https://image.tmdb.org/t/p/w500/hZwCvI7x2f2ZG0ZybInfQeGyyIA.jpg',
    backdropUrl: null,
    firstAirDate: '2016-10-11',
    badge: '暮らしと仕事',
    reason: '家事と労働の話が軸。生活語彙と職場語彙の両方を一本で拾える。',
  },
  {
    tmdbId: 55582,
    title: '孤独のグルメ',
    titleRomaji: 'Kodoku no Gurume',
    level: 'N3',
    posterUrl: 'https://image.tmdb.org/t/p/w500/3DEWsJv0OxHON7AEy4Us6m3e7fS.jpg',
    backdropUrl: null,
    firstAirDate: '2012-01-04',
    badge: '独り言で覚える',
    reason: '注文と感想の独白が中心。話者が一人で速度も一定なので、聞き取りの最初の一本に向く。',
  },
  {
    tmdbId: 69857,
    title: 'カルテット',
    titleRomaji: 'Quartet',
    level: 'N3',
    posterUrl: 'https://image.tmdb.org/t/p/w500/wIXrZyXGINYYxo80pshcJEgzynk.jpg',
    backdropUrl: null,
    firstAirDate: '2017-01-17',
    badge: '会話劇の名作',
    reason: '含みのある言い回しと間の取り方が濃い。行間を聞き取る練習になる。',
  },
  {
    tmdbId: 241795,
    title: '不適切にもほどがある！',
    titleRomaji: 'Futekisetsu ni mo Hodo ga Aru',
    level: 'N3',
    posterUrl: 'https://image.tmdb.org/t/p/w500/qIClDKdMH6H6VBCnF3gSywlNMVG.jpg',
    backdropUrl: null,
    firstAirDate: '2024-01-26',
    badge: '昭和と令和',
    reason: '昭和と現代の話し方を意図的に対比する構成。世代で変わる語感を体感できる。',
  },
  {
    tmdbId: 296719,
    title: 'じゃあ、あんたが作ってみろよ',
    titleRomaji: 'Jaa, Anta ga Tsukutte Miro yo',
    level: 'N3',
    posterUrl: 'https://image.tmdb.org/t/p/w500/74yLBUEOnRuiqbvz7xhwXsMHFlK.jpg',
    backdropUrl: null,
    firstAirDate: '2025-10-07',
    badge: '生活の口論',
    reason: '家庭内のやり取りが素の口語。言い返し方や語尾の温度差が拾いやすい。',
  },
  {
    tmdbId: 62057,
    title: 'GTO',
    titleRomaji: 'GTO',
    level: 'N3',
    posterUrl: 'https://image.tmdb.org/t/p/w500/b6wKiR4tZKWhVDymeB0A00bYvlX.jpg',
    backdropUrl: null,
    firstAirDate: '1998-07-07',
    badge: 'くだけた話し方',
    reason: '教室と職員室でトーンが切り替わる。乱暴な口語と敬語の落差を同時に聞ける。',
  },

  // ---- N2 前後: 専門語彙が入り、話速も上がる ----
  {
    tmdbId: 55925,
    title: '半沢直樹',
    titleRomaji: 'Hanzawa Naoki',
    level: 'N2',
    posterUrl: 'https://image.tmdb.org/t/p/w500/4Qnk3QvC8gxTWH5uM8thovg1j4Q.jpg',
    backdropUrl: null,
    firstAirDate: '2013-07-07',
    badge: '硬い敬語',
    reason: '銀行が舞台で、交渉と謝罪の場面が多い。かたい敬語をまとめて浴びられる。',
  },
  {
    tmdbId: 75701,
    title: 'アンナチュラル',
    titleRomaji: 'Unnatural',
    level: 'N2',
    posterUrl: 'https://image.tmdb.org/t/p/w500/4P7g3eTxJ7FO3zHhEUNv78le3A7.jpg',
    backdropUrl: null,
    firstAirDate: '2018-01-12',
    badge: '専門語彙',
    reason: '法医学の用語とテンポの速い会話。説明台詞が多く、聞き取りの負荷を上げたいときに。',
  },
  {
    tmdbId: 95718,
    title: 'グランメゾン東京',
    titleRomaji: 'Grand Maison Tokyo',
    level: 'N2',
    posterUrl: 'https://image.tmdb.org/t/p/w500/2BkkqUop7NM4BfStDi67VHjl21R.jpg',
    backdropUrl: null,
    firstAirDate: '2019-10-20',
    badge: '現場の指示',
    reason: '厨房の短い指示出しと、対外的な敬語が交互に来る。仕事の言い方の幅が広い。',
  },
  {
    tmdbId: 293432,
    title: '19番目のカルテ',
    titleRomaji: '19 Banme no Karute',
    level: 'N2',
    posterUrl: 'https://image.tmdb.org/t/p/w500/kQl9lIhurDIMU4FWNvy1sL1T5PB.jpg',
    backdropUrl: null,
    firstAirDate: '2025-07-13',
    badge: '説明する日本語',
    reason: '患者への説明場面が多く、専門語をやさしく言い換える話し方が繰り返し出てくる。',
  },

  // ---- N1 前後: 語彙も構文も重い ----
  {
    tmdbId: 79289,
    title: 'ブラックペアン',
    titleRomaji: 'Black Pean',
    level: 'N1',
    posterUrl: 'https://image.tmdb.org/t/p/w500/ytnZ4ckONspXaQQXf81QfzSQCd.jpg',
    backdropUrl: null,
    firstAirDate: '2018-04-22',
    badge: '医療の速さ',
    reason: '手術中の短い専門語のやり取りが続く。語彙より速度で負荷がかかる一本。',
  },
  {
    tmdbId: 218038,
    title: 'VIVANT',
    titleRomaji: 'VIVANT',
    level: 'N1',
    posterUrl: 'https://image.tmdb.org/t/p/w500/31iHlDe30pudzLfPaAg20H5gJmE.jpg',
    backdropUrl: null,
    firstAirDate: '2023-07-16',
    badge: '組織の言葉',
    reason: '諜報と商社の硬い語彙が中心。長い説明台詞を追い切る訓練になる。',
  },
  {
    tmdbId: 31816,
    title: 'ドラゴン桜',
    titleRomaji: 'Dragon Zakura',
    level: 'N1',
    posterUrl: 'https://image.tmdb.org/t/p/w500/eUKp3FyfMYDN2N3U5bhKuGdBG22.jpg',
    backdropUrl: null,
    firstAirDate: '2005-07-08',
    badge: '論理の日本語',
    reason: '説得と講義が本編。理屈を組み立てる言い回しがそのまま教材になる。',
  },
  {
    tmdbId: 304194,
    title: 'リブート',
    titleRomaji: 'Reboot',
    level: 'N1',
    posterUrl: 'https://image.tmdb.org/t/p/w500/1q42BNMaiUu9OSN9W14vbIqce6n.jpg',
    backdropUrl: null,
    firstAirDate: '2026-01-18',
    badge: '今期で追う',
    reason: '放送中の作品を追うと、字幕が出るまで待てない分だけ聞く姿勢になる。',
  },

  // ---- N1 超: 語彙が現代語から外れる ----
  {
    tmdbId: 31616,
    title: '龍馬伝',
    titleRomaji: 'Ryomaden',
    level: 'N1+',
    posterUrl: 'https://image.tmdb.org/t/p/w500/ysJUv3ZkvyhGe4ZHRB5lMiiG7nT.jpg',
    backdropUrl: null,
    firstAirDate: '2010-01-03',
    badge: '規格外',
    reason: '幕末の語彙と土佐弁。現代語の外に出たいとき用で、日常会話の練習には向かない。',
  },
];

/** トップの横長スロット。1 本だけ大きく見せる */
export const DRAMA_HERO: DramaPick = {
  tmdbId: 68786,
  title: '昼顔〜平日午後3時の恋人たち〜',
  titleRomaji: 'Hirugao',
  level: 'N2',
  posterUrl: 'https://image.tmdb.org/t/p/w500/x36ovla0YLWM0mEeK6quCCytQCe.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/9yPiEh9axxUJ5eiiWOkA1KsPrWd.jpg',
  firstAirDate: '2014-07-17',
  badge: 'まず一本目',
  reason: '主婦同士の雑談が長く、相づちと言いよどみがそのまま残る。教科書に出てこない「話し言葉の間」を拾うならここから。',
};

const NOTES = new Map([...DRAMA_PICKS, DRAMA_HERO].map((pick) => [pick.tmdbId, pick]));

export function dramaEditorialNote(id: number): DramaEditorialNote | undefined {
  const pick = NOTES.get(id);
  return pick ? { badge: pick.badge, reason: pick.reason } : undefined;
}

function toCatalogDrama(pick: DramaPick): CatalogDrama {
  return {
    id: pick.tmdbId,
    title: pick.title,
    // リソース検索は titleNative と titleEnglish の両方を検索語にするので、
    // ローマ字はここに載せる（Nyaa の実写では原題より当たる）
    titleEnglish: pick.titleRomaji,
    titleNative: pick.title,
    coverImage: pick.posterUrl,
    bannerImage: pick.backdropUrl,
    description: '',
    score: null,
    episodes: null,
    status: 'FINISHED',
    startDate: pick.firstAirDate,
    network: null,
    links: [],
    recommendation: { badge: pick.badge, reason: pick.reason },
    level: pick.level,
  };
}

/** TMDB トークンが無くても表示できる、カタログ形状のエントリ */
export function dramaFeatured(): CatalogDrama[] {
  return DRAMA_PICKS.map(toCatalogDrama);
}

export function dramaHero(): CatalogDrama {
  return toCatalogDrama(DRAMA_HERO);
}

/** 厳選リストとヒーローを合わせた、ローカルで解決できる全作品 */
export function dramaLocalEntry(id: number): CatalogDrama | null {
  const pick = NOTES.get(id);
  return pick ? toCatalogDrama(pick) : null;
}
