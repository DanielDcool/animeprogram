# Anime Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有本地学习播放器中加入实时季番推荐、动画搜索、作品详情、官方资源入口和本地媒体库衔接。

**Architecture:** Fastify 新增 `catalog` 模块，通过可注入 AniList GraphQL client 取得公开数据并做字段归一化与内存缓存；React 增加发现页和详情页，只通过 `web/src/api.ts` 访问 REST。现有播放器、jimaku 和媒体扫描保持原边界。

**Tech Stack:** Node 22、TypeScript、Fastify 5、内置 `fetch`、React 19、React Router、Vite、Vitest。

## Global Constraints

- 不新增运行时 npm 依赖。
- 不接入盗版播放站、磁力搜索或不明下载文件；资源只来自 AniList 的 HTTPS `STREAMING`/`INFO` 链接。
- AniList 请求最多返回 20 条、过滤 `isAdult: false`，缓存 10 分钟。
- 前端 UI 日文，编辑推荐理由中文；颜色只使用或扩展 `:root` 变量。
- 按 TDD 先看测试失败，再实现最小代码。

---

## File Structure

```text
server/src/modules/catalog/
  client.ts       # AniList 请求、normalize、cache、季度计算
  editorial.ts    # 少量本地推荐理由
  routes.ts       # /api/catalog/*
server/test/catalog-client.test.ts
server/test/catalog-routes.test.ts
web/src/pages/DiscoverPage.tsx
web/src/pages/AnimeDetailPage.tsx
web/src/catalog/view.ts
web/test/catalog-view.test.ts
```

## Task 1: Catalog domain and AniList adapter

**Files:**
- Create: `server/src/modules/catalog/client.ts`
- Create: `server/src/modules/catalog/editorial.ts`
- Test: `server/test/catalog-client.test.ts`

**Interfaces:**
- Produces: `CatalogClient`, `CatalogAnime`, `SeasonRef`, `getSeasonPair(now)`, `createAniListCatalog(fetchImpl, now)`.
- `CatalogClient` methods: `home(): Promise<CatalogHome>`, `search(query: string): Promise<CatalogAnime[]>`, `detail(id: number): Promise<CatalogAnime | null>`.

- [x] Write failing tests using a fake `fetch` for Summer/Spring calculation, description cleanup, HTTPS resource filtering, editorial merge and repeated-call cache hit.
- [x] Run `npm test -w server -- catalog-client.test.ts`; expect missing module failure.
- [x] Implement the types, GraphQL queries, normalization and 10-minute `Map` cache with no extra dependency.
- [x] Re-run the targeted test; expect all catalog client tests to pass.

## Task 2: Catalog REST routes

**Files:**
- Create: `server/src/modules/catalog/routes.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/catalog-routes.test.ts`

**Interfaces:**
- Consumes: `CatalogClient` from Task 1.
- Produces: `catalogRoutes(app, { client })` and routes `/api/catalog/home`, `/search`, `/anime/:id`.

- [x] Write failing Fastify injection tests for successful home/search/detail, short query 400, missing detail 404 and upstream 502.
- [x] Run `npm test -w server -- catalog-routes.test.ts`; expect missing route/module failure.
- [x] Implement one Fastify plugin, register a real client in `buildApp`, and map only the specified errors.
- [x] Re-run route tests; expect pass, then run all server tests.

## Task 3: Frontend API, types and view helpers

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/api.ts`
- Create: `web/src/catalog/view.ts`
- Test: `web/test/catalog-view.test.ts`

**Interfaces:**
- Produces: `CatalogAnime`, `CatalogHome`, `seasonLabel(ref)`, `statusLabel(status)` and API methods `catalogHome`, `catalogSearch`, `catalogDetail`.

- [x] Write failing tests for `SUMMER → 7月新番`, `SPRING → 4月新番`, missing score and release status labels.
- [x] Run `npm test -w web -- catalog-view.test.ts`; expect missing module failure.
- [x] Add exact shared types, REST methods and minimal pure helpers.
- [x] Re-run targeted tests; expect pass.

## Task 4: Discover and detail pages

**Files:**
- Create: `web/src/pages/DiscoverPage.tsx`
- Create: `web/src/pages/AnimeDetailPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/pages/PlayerPage.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: Task 3 API and types.
- Produces: routes `/`, `/anime/:id`, `/library`; existing `/play/:id`, `/vocab`, `/settings` remain.

- [x] Build `DiscoverPage` states: loading, home, search result, empty and retryable error.
- [x] Build card grid, editorial hero, season tabs and semantic buttons/links.
- [x] Build `AnimeDetailPage` with HTTPS official resources and local-library callout.
- [x] Update navigation and player back-link; add responsive CSS without changing player behavior.
- [x] Run web tests and TypeScript/Vite build if available.

## Task 5: Verification and docs

**Files:**
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`

- [x] Run `npm test`; server and web suites pass.
- [x] Start server/web and verify in browser: home seasons, search, detail, resource link and library navigation.
- [x] Check 320px viewport, image fallback CSS and retryable error states.
- [x] Update README user flow and DEVELOPMENT architecture, decisions, verified baseline and remaining download-provider boundary.
- [x] Run `git diff --check` and inspect `git status`; do not commit or push without a new explicit user request.
