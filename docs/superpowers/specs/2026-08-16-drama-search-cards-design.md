# ドラマ検索を作品カードにする（Bangumi 目录 + Nyaa 直搜兜底）设计

日期：2026-08-16
状态：已确认（用户于同日批准）

## 背景

2026-08-15 去掉 TMDB 后（commit `47c6dbf`），ドラマ模式没有任何作品目录数据源，顶部搜索框只能
把关键词直接交给 Nyaa，页面立刻变成下载候选列表。用户反馈：希望和アニメ侧一样，先看到
「有海报、有简介」的作品卡片，点进详情再找资源；同时保留 Nyaa 直搜作为「精选与目录都没有」时的兜底。

## 目标

1. ドラマ搜索结果显示为作品卡片网格（海报 / 日文标题 / 年 · 話数 · 电视台 / 评分徽章），
   视觉复用アニメ侧 `anime-card`。
2. 卡片可点进详情页，显示日文简介、评分、集数、电视台，并沿用既有 Nyaa 资源搜索与本地学习入口。
3. 卡片网格下方保留一个按钮「もっと探す（Nyaa で直接検索）」，展开现在这套关键词直搜；
   目录 0 命中或目录服务不可用时直接展开，搜索框永远不会「变死」。
4. **零配置**：不引入任何 API key（这是昨天去掉 TMDB 的原因，不回退）。

## 非目标

- 不恢复 TMDB；不做当季クール一览、配信入口。
- 不把 Bangumi 数据镜像进仓库；不做「追剧」列表。
- 精选清单（`drama/editorial.ts`，TMDB id 空间）不动，仍是首页唯一内容。

## 数据源选择：Bangumi（api.bgm.tv）

实测（2026-08-16，未带任何凭证）：

- `POST /v0/search/subjects?limit=20`，body `{"keyword":"白い","filter":{"type":[6]}}` → 10 条，
  含 `name`（日文原题）、`name_cn`、`date`、`platform`（`日剧` / `电影`）、`rating.score`（0–10）、
  `eps`、`images.large`、`summary`。「アンナチュラル」→ 8.4 分 / 10 集 / 官方日文简介。
- `GET /v0/subjects/225581` → `summary` 为日文；`infobox` 含 `别名`（`UNNATURAL`）、`电视台`
  （`TBSテレビ`）、`开始`/`结束` 等。
- 海报 `https://lain.bgm.tv/pic/cover/l/...jpg` 直连与带 localhost Referer 均 200。
- 要求请求带可识别的 `User-Agent`（Bangumi API 文档要求）。

对比：TMDB 需要 token（用户已否决）；日文 Wikipedia 有日文简介但海报基本缺失且噪音大。
Bangumi 的代价：社区数据库，冷门老剧可能缺、部分简介为中文；接受。

## 架构

### server（`server/src/modules/drama/`）

**新增 `bangumi.ts`**

```ts
export interface DramaCatalogClient {
  search(query: string): Promise<CatalogDrama[]>;
  detail(id: number): Promise<CatalogDrama | null>;   // 404 → null
}
export class DramaUpstreamError extends Error {}
export function createBangumiCatalog(fetchImpl = globalThis.fetch, opts?: { userAgent?: string }): DramaCatalogClient
```

- search：`POST https://api.bgm.tv/v0/search/subjects?limit=20`，`{ keyword, filter: { type: [6] } }`；
  只保留 `platform === '日剧'` 且 `nsfw !== true` 的条目（剔除电影 / 综艺 / 韩剧 / 华语剧）。
- detail：`GET https://api.bgm.tv/v0/subjects/:id`；`type !== 6` 或 `platform !== '日剧'` 也视为 null。
- 归一化为 `CatalogDrama`：`id`=Bangumi subject id、`title`=`name`、`titleRomaji`=infobox `别名` 中
  第一个纯拉丁字母别名（无则 null）、`titleAliases`=全部拉丁别名、`coverImage`=`images.large`、
  `bannerImage`=null、`startDate`=`date`、`description`=清理换行后的 `summary`、`score`=`rating.score`
  （0 或无 total 视为 null）、`episodes`=`eps`（0 → null）、`network`=infobox `电视台`（字符串或
  `[{v}]` 数组取第一个）、`source: 'bangumi'`。
- 10 分钟进程内缓存（key：`search:<lower>` / `detail:<id>`），与 AniList 客户端同模式。
- 网络错误 / 非 2xx（404 除外）/ JSON 解析失败 → `DramaUpstreamError`。
- `User-Agent: tanku-anime/<version> (https://github.com/DanielDcool/tankuanime)`，版本读 `package.json`。

**`editorial.ts`**：`CatalogDrama` 改为两类共用的形状——`level` / `recommendation` 变为可选，
新增可选 `description` / `score` / `episodes` / `network` / `titleAliases`，新增 `source: 'editorial' | 'bangumi'`。
精选条目 `source: 'editorial'`。新增 `dramaEditorialByTitle(title)`：按标题（去空白、小写）查精选，
供搜索结果合并 `level` / `recommendation` / `titleRomaji`。

**`routes.ts`**（`DramaRoutesOpts` 新增 `catalog: DramaCatalogClient`）

| 路由 | 行为 |
|---|---|
| `GET /api/drama/search?q=` | **改为**返回 `{ items: CatalogDrama[] }`（Bangumi）。q < 2 字 → 400；上游失败 → 502 `DRAMA_UNAVAILABLE`。命中标题与精选同名时合并精选的 `level`/`recommendation`/`titleRomaji` |
| `GET /api/drama/search/resources?q=&category=` | 现在的 Nyaa 关键词直搜原样搬到这里（含罗马字回退与 502 `RESOURCE_UNAVAILABLE`） |
| `GET /api/drama/bgm/:id` | Bangumi 详情；null → 404 `DRAMA_NOT_FOUND`；上游失败 → 502 |
| `GET /api/drama/bgm/:id/resources?category=` | 检索词 = [`title`, ...`titleAliases`]；若没有拉丁别名再追加 `toRomaji(title)`；`kind: 'drama'`，season 推断与精选一致；Bangumi 详情失败 → 502 `DRAMA_UNAVAILABLE`（没有本地替代） |
| `GET /api/drama/home`、`/api/drama/:id`、`/api/drama/:id/resources` | 不变 |

`index.ts`：`createBangumiCatalog()` 注入 `dramaRoutes`。

### web

- `types.ts`：`CatalogDrama` 与服务端同步（可选字段 + `source`）。
- `api.ts`：`dramaSearch(q)` → `{ items }`；`dramaSearchResources` 改路径为 `/api/drama/search/resources`；
  新增 `dramaBangumiDetail(id)`、`dramaBangumiResources(id, category)`。
- `drama/view.ts`：新增 `dramaScoreLabel(score)`（`8.4` → `"8.4"`，null → `評価なし`）、
  `dramaCardMeta(drama)`（`2018年 · 10話 · TBSテレビ`，缺项跳过）、`dramaDetailPath(drama)`
  （`source === 'bangumi'` → `/drama/bgm/:id`，否则 `/drama/:id`）。
- `DramaDiscoverPage`：提交后调用 `api.dramaSearch`，状态 `results | null`、`searching`、`showResources`。
  - 有结果：`anime-grid` 网格；卡片徽章为评分，副行 `dramaCardMeta`，tags 显示精选合并来的 `badge`
    或 `network`。网格下方 `<button>` 「もっと探す（Nyaa で直接検索）」→ 展开 `ResourceResults`
    （`autoLoadOn=submitted`，取数 `api.dramaSearchResources`）。
  - 0 命中：文案「作品が見つかりませんでした。Nyaa で直接探せます。」并**自动展开** `ResourceResults`。
  - 目录失败：`catalog-error` 文案 + 自动展开 `ResourceResults`。
  - 换关键词时收起已展开的直搜（`showResources` 重置）。
- `DramaDetailPage`：新增路由 `/drama/bgm/:id`（`App.tsx` 同样 `ForceMode drama`）。页面按
  `useLocation`/`useMatch` 判断来源，选择 `dramaDetail` 或 `dramaBangumiDetail`，资源取数同理。
  条件渲染：`recommendation.badge`、`level`、`titleRomaji`、`recommendation.reason` 有才显示；
  新增 `description`（段落）、`score`、`episodes`、`network` 到 `detail-facts` / 正文。
- 页脚文案（发现页与详情页）：「作品リストはこのアプリに同梱の手書き、検索結果と作品情報は
  Bangumi (bgm.tv) を参照しています。ポスター画像は各サービスのものです。」

### 文档

- `docs/DEVELOPMENT.md`：架构表 `drama/` 行加 `bangumi.ts`；功能表「日剧发现」行改写；§4 新增决策
  「日剧目录检索用 Bangumi 而不是 TMDB / Wikipedia」；§5 加 Bangumi 覆盖率与中文简介的已知取舍；
  删除已过时的 TMDB 待联调条目。
- 三语 README：删掉「配置 TMDB token」段落，加 Bangumi 署名（数据来自 Bangumi 番组计划，非官方
  产品），修正「TMDB 尚未联调」的状态句。

## 错误处理

- Bangumi 挂 → 搜索 502，前端展示错误并自动展开 Nyaa 直搜；精选首页与精选详情不受影响。
- Bangumi 详情 404 → 前端「作品が見つかりませんでした」+ 返回链接。
- Nyaa 挂 → 既有 `RESOURCE_UNAVAILABLE` 卡片（含代理提示）不变。

## 测试

- `server/test/drama-bangumi.test.ts`：注入 fake fetch——搜索归一化、`platform` 过滤、nsfw 过滤、
  别名/电视台解析、评分 0 → null、缓存命中、非 2xx → `DramaUpstreamError`、详情 404 → null、UA 头。
- `server/test/drama-routes.test.ts`：fake catalog——搜索返回卡片、同名合并精选、q 过短 400、
  上游 502；`search/resources` 保留原有测试（改路径）；`bgm/:id` 200/404/502；`bgm/:id/resources`
  检索词含别名 / 无别名时含罗马字、`kind: 'drama'`。
- `web/test/drama-view.test.ts`：`dramaScoreLabel` / `dramaCardMeta` / `dramaDetailPath`。
- 浏览器实测：「白い」→ 卡片网格（海报、评分）→ 点「白い巨塔」详情（简介、电视台）→ 资源列表；
  返回后点「もっと探す」展开 Nyaa 直搜；输入生僻词 0 命中自动展开；控制台无 error。
