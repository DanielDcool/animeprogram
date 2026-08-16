# ドラマ検索を作品カードにする Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ドラマ模式的搜索改为 Bangumi 作品卡片网格 + 详情页，网格下方「もっと探す」按钮展开现有 Nyaa 关键词直搜。

**Architecture:** 服务端新增 `drama/bangumi.ts` 目录客户端（注入 fetch、10 分钟缓存、`DramaUpstreamError`），`drama/routes.ts` 把 `/api/drama/search` 改为返回卡片、直搜移到 `/api/drama/search/resources`、新增 `bgm/:id` 详情与资源路由；精选清单与其路由不动。前端 `DramaDiscoverPage` 渲染卡片网格与「もっと探す」按钮，`DramaDetailPage` 兼容 `/drama/bgm/:id`。

**Tech Stack:** Fastify + vitest（server）、React + react-router + vitest（web）、Bangumi v0 API（无 key）。

设计见 `docs/superpowers/specs/2026-08-16-drama-search-cards-design.md`。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `server/src/modules/drama/bangumi.ts`（新增） | Bangumi 客户端：search / detail、归一化、过滤、缓存、错误 |
| `server/src/modules/drama/editorial.ts` | `CatalogDrama` 形状扩展（可选字段 + `source`）；`dramaEditorialByTitle` |
| `server/src/modules/drama/routes.ts` | 路由改造 |
| `server/src/index.ts` | 注入 `createBangumiCatalog()` |
| `server/test/drama-bangumi.test.ts`（新增）、`server/test/drama-routes.test.ts` | 测试 |
| `web/src/types.ts`、`web/src/api.ts` | 类型与 API 方法 |
| `web/src/drama/view.ts`、`web/test/drama-view.test.ts` | 卡片文案纯函数 |
| `web/src/pages/DramaDiscoverPage.tsx`、`web/src/pages/DramaDetailPage.tsx`、`web/src/App.tsx` | UI |
| `docs/DEVELOPMENT.md`、`README.md`、`README.zh-CN.md`、`README.ja.md` | 文档 |

---

### Task 1: 扩展 `CatalogDrama` 形状（server）

**Files:** Modify `server/src/modules/drama/editorial.ts`

- [x] `CatalogDrama` 改为：

```ts
export type DramaSource = 'editorial' | 'bangumi';
export interface CatalogDrama {
  id: number;
  source: DramaSource;
  title: string;
  titleRomaji: string | null;
  /** リソース検索に回す追加の検索語（Bangumi の別名のうちラテン文字のもの） */
  titleAliases: string[];
  coverImage: string | null;
  bannerImage: string | null;
  startDate: string | null;
  description: string | null;
  score: number | null;      // 0–10（Bangumi）。厳選は null
  episodes: number | null;
  network: string | null;
  level?: DramaLevel;
  recommendation?: DramaEditorialNote;
}
```

- [x] `toCatalogDrama` 填 `source: 'editorial'`、`titleAliases: []`、`description/score/episodes/network: null`。
- [x] 新增：

```ts
function titleKey(title: string): string { return title.replace(/\s+/g, '').toLocaleLowerCase(); }
const BY_TITLE = new Map([...DRAMA_PICKS, DRAMA_HERO].map((pick) => [titleKey(pick.title), pick]));
/** 検索結果と同名の厳選があれば、その難易度と推薦文を返す */
export function dramaEditorialByTitle(title: string): CatalogDrama | null {
  const pick = BY_TITLE.get(titleKey(title));
  return pick ? toCatalogDrama(pick) : null;
}
```

- [x] `npx vitest run test/drama-editorial.test.ts test/drama-routes.test.ts`（在 `server/`）应仍通过；`npx tsc --noEmit -p server` 通过。

### Task 2: Bangumi 客户端（TDD）

**Files:** Create `server/src/modules/drama/bangumi.ts`、`server/test/drama-bangumi.test.ts`

- [x] 写测试（fake fetch 记录 url/init，返回预置 JSON）：
  1. search 发 `POST https://api.bgm.tv/v0/search/subjects?limit=20`，body 含 `keyword` 与 `filter.type=[6]`，headers 含 `user-agent`（含 `tanku-anime`）与 `content-type: application/json`。
  2. 只保留 `platform === '日剧'` 且非 nsfw；归一化 `title/coverImage/startDate/score/episodes/description/source='bangumi'`；`rating.score=0` 或 `rating.total=0` → `score:null`；`eps=0` → null；`summary` 的 `\r\n` → `\n`。
  3. detail：`GET https://api.bgm.tv/v0/subjects/225581`；infobox `别名` `[{v:'UNNATURAL'}]` → `titleRomaji='UNNATURAL'`、`titleAliases=['UNNATURAL']`；`电视台` 字符串 → `network`；`别名` 为字符串也能解析；含日文的别名不进 aliases。
  4. detail 404 → null；detail `type !== 6` → null。
  5. 500 → 抛 `DramaUpstreamError`；fetch reject → `DramaUpstreamError`；非法 JSON → `DramaUpstreamError`。
  6. 缓存：同一 query 两次只 fetch 一次。
- [x] 运行 `npx vitest run test/drama-bangumi.test.ts` → 失败（模块不存在）。
- [x] 实现 `bangumi.ts`：

```ts
import { createRequire } from 'node:module';
import { dramaEditorialByTitle, type CatalogDrama } from './editorial.js';

export interface DramaCatalogClient {
  search(query: string): Promise<CatalogDrama[]>;
  detail(id: number): Promise<CatalogDrama | null>;
}
export class DramaUpstreamError extends Error { constructor(m = 'Drama catalog is unavailable') { super(m); this.name = 'DramaUpstreamError'; } }
export type BangumiFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const API = 'https://api.bgm.tv';
const CACHE_TTL_MS = 10 * 60 * 1000;
const SUBJECT_TYPE_REAL = 6;
const PLATFORM_JDRAMA = '日剧';
// package.json の version を UA に載せる（Bangumi は識別可能な UA を要求）
const require = createRequire(import.meta.url);
const APP_VERSION: string = (require('../../../../package.json') as { version?: string }).version ?? '0.0.0';
export const DEFAULT_USER_AGENT = `tanku-anime/${APP_VERSION} (https://github.com/DanielDcool/tankuanime)`;

interface BangumiInfoboxItem { key?: string; value?: string | Array<{ v?: string; k?: string }> }
interface BangumiSubject {
  id: number; type?: number; name?: string; name_cn?: string; date?: string | null; platform?: string | null;
  summary?: string | null; nsfw?: boolean; eps?: number | null; total_episodes?: number | null;
  images?: { large?: string | null; common?: string | null } | null;
  rating?: { score?: number | null; total?: number | null } | null;
  infobox?: BangumiInfoboxItem[] | null;
}
```

  归一化：`infoboxValues(subject, key)` 把字符串/数组统一成 `string[]`；`latinAliases = values('别名').filter(v => /^[\x20-\x7e]+$/.test(v))`；`network = values('电视台')[0] ?? null`；`description = summary?.replace(/\r\n?/g,'\n').trim() || null`；然后 `const editorial = dramaEditorialByTitle(name)`，如命中则并入 `level`、`recommendation`，且 `titleRomaji ??= editorial.titleRomaji`。
  request：与 AniList 一致，`fetchImpl` 抛错 / `!ok`（404 单独返回 null）/ JSON 失败 → `DramaUpstreamError`。
- [x] 运行测试 → 通过。

### Task 3: 路由改造（TDD）

**Files:** Modify `server/src/modules/drama/routes.ts`、`server/test/drama-routes.test.ts`、`server/src/index.ts`

- [x] 测试改动：
  - `buildTestApp(resources, catalog = fakeCatalog())`；`fakeCatalog` 实现 `search/detail`，可配置返回值或抛 `DramaUpstreamError`。
  - 「keyword search goes straight to nyaa」与「japanese input falls back」两组的 URL 改为 `/api/drama/search/resources?...`。
  - 新增「catalog search returns cards」：`/api/drama/search?q=白い` → 200 `{ items: [...] }`；q 过短 400 且 catalog 未被调用；catalog 抛错 → 502 `DRAMA_UNAVAILABLE`。
  - 新增「bangumi detail」：`/api/drama/bgm/225581` → 200 且 `source==='bangumi'`；detail 返回 null → 404；抛错 → 502；`/api/drama/bgm/abc` → 400。
  - 新增「bangumi resources」：`titleAliases:['UNNATURAL']` → provider 收到 `['アンナチュラル','UNNATURAL']` 且 `kind:'drama'`；无别名 + `toRomaji` → 收到 `[title, romaji]`；detail null → 404；Nyaa 挂 → 502 `RESOURCE_UNAVAILABLE`。
- [x] 运行 → 失败。
- [x] 实现：`DramaRoutesOpts.catalog: DramaCatalogClient`；`runCatalog(reply, op)` 把 `DramaUpstreamError` 变 502；新增三条路由；旧关键词直搜路由 URL 改为 `/api/drama/search/resources`。`bgm/:id/resources` 检索词：

```ts
const titles = uniqueTitles([drama.title, ...drama.titleAliases]);
const queries = titles.length > 1 || !opts.toRomaji || !hasJapanese(drama.title)
  ? titles
  : await queryVariants(drama.title);
const season = inferSeasonNumber(titles);
return searchResources(reply, buildSeasonSearchQueries(queries, season), category, season);
```

- [x] `index.ts`：`import { createBangumiCatalog } from './modules/drama/bangumi.js'`，`dramaRoutes` 传 `catalog: createBangumiCatalog()`。
- [x] `npm test`（server）全绿；`tsc --noEmit` 通过。

### Task 4: web 类型、API、纯函数（TDD）

**Files:** Modify `web/src/types.ts`、`web/src/api.ts`、`web/src/drama/view.ts`、`web/test/drama-view.test.ts`

- [x] `types.ts` 的 `CatalogDrama` 与 Task 1 一致（`source`、`titleAliases`、`description`、`score`、`episodes`、`network`，`level`/`recommendation` 可选）。
- [x] `api.ts`：
  - `dramaSearch: (query) => request('/api/drama/search?q=...').then(j<{ items: CatalogDrama[] }>)`
  - `dramaSearchResources` 路径改 `/api/drama/search/resources`
  - `dramaBangumiDetail: (id) => request('/api/drama/bgm/${id}')`
  - `dramaBangumiResources: (id, category) => request('/api/drama/bgm/${id}/resources?category=...')`
- [x] `drama-view.test.ts` 新增：
  - `dramaScoreLabel(8.4)==='8.4'`、`dramaScoreLabel(9)==='9.0'`、`dramaScoreLabel(null)==='評価なし'`
  - `dramaCardMeta({startDate:'2018-01-12',episodes:10,network:'TBSテレビ'})==='2018年 · 10話 · TBSテレビ'`；全 null → `''`
  - `dramaDetailPath({source:'bangumi',id:1})==='/drama/bgm/1'`；editorial → `/drama/1`
- [x] 运行失败 → 实现 → 通过。

### Task 5: DramaDiscoverPage 卡片 + もっと探す

**Files:** Modify `web/src/pages/DramaDiscoverPage.tsx`

- [x] 状态：`results: CatalogDrama[] | null`、`searching`、`searchError`、`showResources`。
- [x] `search()`：校验后 `setSearching(true)`；`api.dramaSearch(term)` → `setResults(items)`，`setShowResources(items.length === 0)`；catch → `setSearchError('作品情報を取得できませんでした。Nyaa で直接探せます。')`、`setResults([])`、`setShowResources(true)`。
- [x] `DramaCard` 改为通用：徽章 `drama.level ?? dramaScoreLabel(drama.score)`；副行 `drama.titleRomaji ?? dramaCardMeta(drama)`；tags：`recommendation?.badge` 或 `network`；`to={dramaDetailPath(drama)}`。
- [x] 搜索区渲染：

```tsx
<section className="catalog-section">
  <div className="section-heading">
    <div><p className="eyebrow">SEARCH</p><h2>「{submitted}」の検索結果</h2></div>
    <p>{results ? `${results.length}作品` : ''}</p>
  </div>
  {searching ? <LoadingCards /> : results && results.length > 0 && (
    <div className="anime-grid">{results.map((d) => <DramaCard drama={d} key={`${d.source}-${d.id}`} />)}</div>
  )}
  {!searching && results && results.length === 0 && !searchError && (
    <p className="search-empty">作品が見つかりませんでした。Nyaa で直接探せます。</p>
  )}
  {!searching && !showResources && (
    <div className="search-more">
      <button type="button" className="quiet-button" onClick={() => setShowResources(true)}>もっと探す（Nyaa で直接検索）</button>
    </div>
  )}
  {showResources && (
    <ResourceResults defaultCategory="all" autoLoadOn={submitted} fetchResources={(c) => api.dramaSearchResources(submitted, c)} />
  )}
</section>
```

- [x] `index.css`：`.search-more { display:flex; justify-content:center; margin: 24px 0 8px; }`、`.search-empty { color: var(--text-3); }`（只用语义 token）。
- [x] 页脚文案更新。

### Task 6: DramaDetailPage 兼容 Bangumi 条目 + 路由

**Files:** Modify `web/src/pages/DramaDetailPage.tsx`、`web/src/App.tsx`

- [x] `App.tsx` 加 `<Route path="/drama/bgm/:id" element={<ForceMode mode="drama" onForce={setMode}><DramaDetailPage /></ForceMode>} />`（放在 `/drama/:id` 之前或之后均可，react-router 会按具体度匹配）。
- [x] `DramaDetailPage`：`const isBangumi = useMatch('/drama/bgm/:id') != null;`；取详情 `isBangumi ? api.dramaBangumiDetail : api.dramaDetail`；资源 `isBangumi ? api.dramaBangumiResources : api.dramaResources`；`subjectId` 用 `${source}-${id}` 不行（number）→ 继续传 `drama.id`，但 `key={`${drama.source}-${drama.id}`}` 挂在 `ResourceResults` 上保证切换重置。
- [x] 渲染：facts 加 `評価`（有 score）、`話数`、`放送局`；`recommendation?.badge`、`level`、`recommendation?.reason` 条件渲染；正文加 `<p className="detail-description">{drama.description}</p>`（有才显示）；页脚文案更新。
- [x] `npm test`（web）全绿；`tsc --noEmit`；`npm run build`（web）通过。

### Task 7: 浏览器验证

- [x] 用 `.claude/launch.json` 启动 server/web；ドラマ模式搜索「白い」→ 卡片含海报与评分；点「白い巨塔」→ 详情有日文简介 / 电视台 / 资源列表；返回搜索点「もっと探す」→ Nyaa 直搜展开；输入无意义词（如「zzqqxx」）→ 空文案 + 自动展开直搜。控制台无 error。全程不播放媒体。

### Task 8: 文档

- [x] `docs/DEVELOPMENT.md`：§2 `drama/` 行加 `bangumi.ts`；§3「日剧发现」行改写；§3 已验证基线加 2026-08-16 条目；§4 加决策；§5 删除 TMDB 联调条目、加 Bangumi 取舍；最后校对日期。
- [x] 三语 README：删除 TMDB token 段落（第 24 行附近、`### ドラマの一覧と検索（TMDB）` 小节、致谢行、结尾状态句），改为 Bangumi 说明与署名。
- [x] 报告实际验证结果与未闭环事项。
