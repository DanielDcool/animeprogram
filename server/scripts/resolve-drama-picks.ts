// 一回だけ実行する補助スクリプト。
//   TMDB_TOKEN=<API Read Access Token> npx tsx scripts/resolve-drama-picks.ts
// 出力の posterUrl を src/modules/drama/editorial.ts に反映する。
// tmdbId は editorial.ts 側で確認済みの値が正。検索が別作品（同名・特別編）を
// 引いた場合は既存の id を優先すること。
// 認証情報は環境変数からのみ読み、出力にもログにも含めない。
import { createTmdbDramaCatalog } from '../src/modules/drama/client.js';
import { DRAMA_PICKS } from '../src/modules/drama/editorial.js';

const token = process.env.TMDB_TOKEN;
if (!token) {
  console.error('TMDB_TOKEN が設定されていません。');
  process.exit(1);
}

const catalog = createTmdbDramaCatalog(token);

for (const pick of DRAMA_PICKS) {
  const detail = await catalog.detail(pick.tmdbId);
  if (!detail) {
    console.log(`// 取得できません: ${pick.title} (tmdbId=${pick.tmdbId})`);
    continue;
  }
  const nameMatches = detail.titleNative === pick.title || detail.titleEnglish === pick.title;
  console.log([
    `  // ${detail.titleNative ?? detail.title}${nameMatches ? '' : ' ← 要確認: 既存タイトルと不一致'}`,
    `  tmdbId: ${pick.tmdbId},`,
    `  posterUrl: ${JSON.stringify(detail.coverImage)},`,
    `  firstAirDate: ${JSON.stringify(detail.startDate)},`,
  ].join('\n'));
}
