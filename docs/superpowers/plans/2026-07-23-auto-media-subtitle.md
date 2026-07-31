# Media Auto-Scan and Jimaku Subtitle Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically import stable video files from `MEDIA_DIR`, then automatically obtain Jimaku subtitles for known series while presenting non-blocking mapping and retry states in the media library.

**Architecture:** A dependency-injected directory watcher treats filesystem events only as wake-up signals and confirms file stability through periodic stat reconciliation before calling the existing scanner. Scanner results feed a persistent, serial Jimaku subtitle coordinator; the React library polls the media list and renders the coordinator state without binding the application to Transmission or qBittorrent.

**Tech Stack:** Node.js 22 filesystem APIs, TypeScript, Fastify 5, better-sqlite3 11, React 19, Vitest 4, existing Jimaku client and ffmpeg wrappers.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-23-auto-media-subtitle-design.md` exactly.
- Do not add an npm dependency; use `node:fs`, existing modules and injected fakes.
- Keep the download boundary at standard `magnet:` plus local `MEDIA_DIR`; do not add downloader RPC or server-side video transfer.
- Stable time is 15,000ms, reconciliation interval is 30,000ms, library polling interval is 5,000ms, and Jimaku minimum queue interval is 2,500ms.
- Do not expose or log API keys, request headers or complete upstream error responses.
- Use TDD for scanner, watcher, Jimaku service/coordinator, routes and web presentation logic.
- Preserve all current uncommitted resource-search changes.
- Do not create a Git commit or push unless the user explicitly requests it; verification checkpoints replace commit steps in this plan.

---

## File map

- `server/src/modules/media/scanner.ts`: scan one explicit set of source video paths and return import/failure results.
- `server/src/modules/media/watcher.ts`: stable-file tracker, `fs.watch` wake-up and periodic reconciliation.
- `server/src/modules/media/routes.ts`: manual scan callback and subtitle state in media list API.
- `server/src/modules/jimaku/service.ts`: reusable Jimaku subtitle download operation and stable error codes.
- `server/src/modules/jimaku/sync.ts`: persistent state helpers and deduplicated serial auto-download coordinator.
- `server/src/modules/jimaku/routes.ts`: thin HTTP adapter over the service; synchronize manual success/failure state.
- `server/src/db.ts`: `subtitle_sync_state` schema.
- `server/src/index.ts`: opt-in lifecycle wiring so tests do not watch the real library.
- `web/src/library/subtitleView.ts`: pure presentation/counting rules.
- `web/src/pages/LibraryPage.tsx`: polling, banner, status and retry UI.
- `web/src/types.ts`, `web/src/index.css`: API type and styles.
- Tests mirror each module under `server/test/` and `web/test/`.

---

### Task 1: Make scanner retry-safe and result-producing

**Files:**
- Modify: `server/src/modules/media/scanner.ts`
- Modify: `server/test/scanner.test.ts`

**Interfaces:**
- Produces: `ScanResult { importedIds: number[]; failedFiles: string[] }`.
- Produces: `scanFiles(db, mediaDir, filePaths, ops?): Promise<ScanResult>`.
- Changes: `scanLibrary(...)` returns `Promise<ScanResult>` while retaining all current import behavior.

- [x] **Step 1: Write failing scanner result and retry tests**

Add tests that assert the imported row ID is returned and an injected probe failure returns the path in `failedFiles` without inserting a `media` row. Change the probe fake to succeed on the next call and assert the same path imports on retry.

```ts
it('does not record probe failures and can import the file on retry', async () => {
  const dir = tmpLib(['Show - 04.mkv']);
  const db = createDb(':memory:');
  let fail = true;
  const retryOps: FfmpegOps = {
    ...fakeOps,
    probe: async (file) => {
      if (fail) throw new Error(`incomplete: ${file}`);
      return fakeOps.probe(file);
    },
  };

  const first = await scanLibrary(db, dir, retryOps);
  expect(first.importedIds).toEqual([]);
  expect(first.failedFiles).toEqual([path.join(dir, 'Show - 04.mkv')]);
  expect(db.prepare('SELECT COUNT(*) c FROM media').get()).toEqual({ c: 0 });

  fail = false;
  const second = await scanLibrary(db, dir, retryOps);
  expect(second.importedIds).toHaveLength(1);
  expect(second.failedFiles).toEqual([]);
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm --workspace server test -- scanner.test.ts`  
Expected: FAIL because `scanLibrary` currently returns `void` and inserts an `unknown` row after probe failure.

- [x] **Step 3: Implement explicit-file scanning**

Add the result type and move the existing loop into this interface:

```ts
export interface ScanResult {
  importedIds: number[];
  failedFiles: string[];
}

export async function scanFiles(
  db: Db,
  mediaDir: string,
  filePaths: string[],
  ops: FfmpegOps = realOps,
): Promise<ScanResult>;

export async function scanLibrary(
  db: Db,
  mediaDir: string,
  ops: FfmpegOps = realOps,
): Promise<ScanResult>;
```

Normalize to absolute paths, accept only direct children with `.mkv`/`.mp4`, reject `.play.mp4`, and keep the current external/embedded subtitle and remux paths. In the probe `catch`, append to `failedFiles` and continue without a database insert. Push each successful `lastInsertRowid` into `importedIds`.

- [x] **Step 4: Run scanner tests and verify GREEN**

Run: `npm --workspace server test -- scanner.test.ts`  
Expected: all scanner tests pass, including current remux, subtitle preference, idempotency and HEVC cases.

---

### Task 2: Extract reusable Jimaku download service

**Files:**
- Create: `server/src/modules/jimaku/service.ts`
- Modify: `server/src/modules/jimaku/routes.ts`
- Modify: `server/test/jimaku.test.ts`

**Interfaces:**
- Produces: `JimakuServiceError` with `code` and `httpStatus`.
- Produces: `downloadJimakuSubtitle(opts): Promise<{ file: string; destination: string }>`.
- Consumes: existing `JimakuClient`, `createJimakuClient`, `pickBestFile`, `getSetting` and current database tables.

- [x] **Step 1: Add direct service tests before changing the route**

Test successful download through the service, stored mapping fallback, missing API key, missing mapping, archive-only results and upstream rejection. Assert stable codes rather than matching arbitrary exception strings.

```ts
await expect(downloadJimakuSubtitle({ db, mediaId: id, clientFactory: () => fakeClient() }))
  .rejects.toMatchObject({ code: 'NO_ENTRY', httpStatus: 400 });
```

- [x] **Step 2: Run the Jimaku tests and verify RED**

Run: `npm --workspace server test -- jimaku.test.ts`  
Expected: FAIL because `service.ts` and `downloadJimakuSubtitle` do not exist.

- [x] **Step 3: Implement the minimal service and convert route to an adapter**

Use this public shape:

```ts
export type JimakuErrorCode =
  | 'MEDIA_NOT_FOUND'
  | 'JIMAKU_NOT_CONFIGURED'
  | 'NO_ENTRY'
  | 'NO_FILE'
  | 'JIMAKU_ERROR';

export class JimakuServiceError extends Error {
  constructor(
    public readonly code: JimakuErrorCode,
    public readonly httpStatus: number,
    message: string,
  ) { super(message); }
}

export async function downloadJimakuSubtitle(opts: {
  db: Db;
  mediaId: number;
  entryId?: number;
  clientFactory?: (apiKey: string) => JimakuClient;
}): Promise<{ file: string; destination: string }>;
```

Preserve current `.srt` preference, archive rejection, destination naming, mapping upsert and subtitle row replacement. The route calls the service and maps `JimakuServiceError.httpStatus` and `.code` to the existing JSON response. Unexpected errors become `JIMAKU_ERROR` without credentials.

- [x] **Step 4: Run Jimaku tests and verify route compatibility**

Run: `npm --workspace server test -- jimaku.test.ts`  
Expected: all existing route tests and new direct service tests pass.

---

### Task 3: Persist subtitle state and build serial coordinator

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/test/db.test.ts`
- Create: `server/src/modules/jimaku/sync.ts`
- Create: `server/test/jimaku-sync.test.ts`
- Modify: `server/src/modules/jimaku/routes.ts`
- Modify: `server/test/jimaku.test.ts`

**Interfaces:**
- Produces: `SubtitleSyncStatus = 'needs_mapping' | 'downloading' | 'failed'`.
- Produces: `setSubtitleSyncState`, `clearSubtitleSyncState`, `sanitizeSyncError`.
- Produces: `createSubtitleSyncCoordinator(opts)` with `reconcile(mediaIds?)`, `retry(mediaId)`, `whenIdle()` and `stop()`.
- Consumes: `downloadJimakuSubtitle` from Task 2.

- [x] **Step 1: Add schema and state-machine tests**

Update the table-list test to require `subtitle_sync_state`. Add coordinator tests for these exact outcomes:

```ts
await coordinator.reconcile([withoutMappingId]);
expect(state(withoutMappingId)).toMatchObject({ status: 'needs_mapping', error: null });

await coordinator.reconcile([mappedId]);
await coordinator.whenIdle();
expect(state(mappedId)).toBeUndefined();
expect(subtitle(mappedId)).toBeDefined();

await coordinator.reconcile([failingMappedId]);
await coordinator.whenIdle();
expect(state(failingMappedId)).toMatchObject({ status: 'failed' });
expect(mapping(failingMappedId)).toBeDefined();
```

Also assert duplicate `reconcile([id, id])` calls make one Jimaku `files` call, and media with an existing subtitle makes none.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm --workspace server test -- db.test.ts jimaku-sync.test.ts jimaku.test.ts`  
Expected: FAIL because the table and coordinator are absent.

- [x] **Step 3: Add the table and state helpers**

Add the exact schema from the design document to `createDb`. Implement parameterized upsert/delete helpers. `sanitizeSyncError` maps known codes to short Japanese messages and truncates unexpected messages; it must never include the configured key.

- [x] **Step 4: Implement the deduplicated serial coordinator**

Use the public factory shape:

```ts
export function createSubtitleSyncCoordinator(opts: {
  db: Db;
  clientFactory?: (apiKey: string) => JimakuClient;
  minIntervalMs?: number;
  delay?: (ms: number) => Promise<void>;
  log?: { error(error: unknown): void };
}): {
  reconcile(mediaIds?: number[]): Promise<void>;
  retry(mediaId: number): Promise<void>;
  whenIdle(): Promise<void>;
  stop(): void;
};
```

`reconcile` queries media without subtitles. It writes `needs_mapping` for missing mappings, `failed` for missing configuration, and enqueues mapped/configured IDs. A `Set<number>` deduplicates queued/running IDs. One async worker processes IDs in order, sets `downloading`, calls the service, clears success state, persists sanitized failure state, and observes `minIntervalMs`. `stop()` prevents new work and clears pending IDs but never deletes persisted state.

- [x] **Step 5: Make manual route downloads synchronize state**

On manual success call `clearSubtitleSyncState`. On manual failure with a known mapping call `setSubtitleSyncState(..., 'failed', sanitizeSyncError(error))`. `NO_ENTRY` remains a candidate-selection condition rather than pretending a mapping failed.

- [x] **Step 6: Run coordinator, database and Jimaku tests GREEN**

Run: `npm --workspace server test -- db.test.ts jimaku-sync.test.ts jimaku.test.ts`  
Expected: all focused tests pass with fake clients and zero injected delay.

---

### Task 4: Watch `MEDIA_DIR` and wait for stable files

**Files:**
- Create: `server/src/modules/media/watcher.ts`
- Create: `server/test/media-watcher.test.ts`

**Interfaces:**
- Produces: `createMediaDirectoryWatcher(opts)` with `start`, `reconcileNow` and `stop`.
- Consumes: `scanFiles` and invokes `onImported(importedIds)` only for newly imported rows.

- [x] **Step 1: Write deterministic stability tests**

Use a temporary directory plus an injected mutable clock. Cover first sighting, change reset, 15-second stability, `.play.mp4`/hidden-file exclusion, idempotency and a failed scan being eligible for retry.

```ts
let now = 0;
const watcher = createMediaDirectoryWatcher({
  db,
  mediaDir: dir,
  stableMs: 15_000,
  pollIntervalMs: 30_000,
  now: () => now,
  scan: (paths) => scanFiles(db, dir, paths, fakeOps),
  onImported: async (ids) => imported.push(...ids),
});

await watcher.reconcileNow();
expect(imported).toEqual([]);
now = 15_000;
await watcher.reconcileNow();
expect(imported).toHaveLength(1);
```

- [x] **Step 2: Run watcher tests and verify RED**

Run: `npm --workspace server test -- media-watcher.test.ts`  
Expected: FAIL because `watcher.ts` does not exist.

- [x] **Step 3: Implement the watcher without third-party dependencies**

Use this boundary:

```ts
export function createMediaDirectoryWatcher(opts: {
  db: Db;
  mediaDir: string;
  stableMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  scan?: (filePaths: string[]) => Promise<ScanResult>;
  onImported?: (mediaIds: number[]) => Promise<void> | void;
  watchFactory?: typeof fs.watch;
  log?: { error(error: unknown): void };
}): {
  start(): Promise<void>;
  reconcileNow(): Promise<void>;
  stop(): void;
};
```

Maintain a path-to-sample map and a single reconciliation lock. `start()` ensures the directory exists, samples it immediately, attaches one non-recursive `fs.watch`, and starts the interval. Watch events schedule a debounced reconciliation but never call scanner directly. `stop()` closes watcher/interval/debounce handles. Catch errors per reconciliation and report through injected logger.

- [x] **Step 4: Run watcher and scanner tests GREEN**

Run: `npm --workspace server test -- media-watcher.test.ts scanner.test.ts`  
Expected: all tests pass without observing the user's real media directory.

---

### Task 5: Wire lifecycle, manual scans and media status API

**Files:**
- Modify: `server/src/modules/media/routes.ts`
- Modify: `server/test/media-routes.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/test/smoke.test.ts`

**Interfaces:**
- `mediaRoutes` gains optional `onImported(mediaIds)` and calls it after manual scan.
- `GET /api/media` produces `subtitleStatus` and `subtitleError`.
- `buildApp({ enableMediaAutomation?: boolean })` defaults to disabled for tests; the real main process enables it.

- [x] **Step 1: Add route tests for four subtitle states and manual callback**

Seed one row for each state and assert:

```ts
expect(bySeries.Ready.subtitleStatus).toBe('ready');
expect(bySeries.NeedsMapping.subtitleStatus).toBe('needs_mapping');
expect(bySeries.Downloading.subtitleStatus).toBe('downloading');
expect(bySeries.Failed).toMatchObject({ subtitleStatus: 'failed', subtitleError: '取得に失敗しました' });
```

Add a manual scan test with fake `FfmpegOps` and `onImported = vi.fn()`; assert it receives the scanner's new media ID.

- [x] **Step 2: Run route tests and verify RED**

Run: `npm --workspace server test -- media-routes.test.ts smoke.test.ts`  
Expected: FAIL because API fields and callback do not exist.

- [x] **Step 3: Return state from `GET /api/media` and forward manual results**

LEFT JOIN `subtitle_sync_state`; calculate `ready` when `subtitle_file` exists, otherwise use the stored state and fall back to `needs_mapping`. Return `subtitleError` only for `failed`. After `scanLibrary`, await optional `onImported(result.importedIds)` and keep `{ ok: true }` response compatibility.

- [x] **Step 4: Compose automation behind an explicit build option**

Change the public constructor to:

```ts
export async function buildApp(opts: { enableMediaAutomation?: boolean } = {})
```

When enabled, create one subtitle coordinator and one media watcher. Pass the coordinator to manual scan and the watcher `onImported`. Add Fastify `onReady` logic to reconcile all subtitle-less existing media and start the watcher, and `onClose` logic to stop both. The `isMain` path calls `buildApp({ enableMediaAutomation: true })`; tests calling `buildApp()` remain isolated.

- [x] **Step 5: Run all server tests**

Run: `npm --workspace server test`  
Expected: all server tests pass; no test starts `fs.watch` on `/Users/daniel/AnimeLibrary` or performs a real Jimaku request.

---

### Task 6: Add non-blocking library status UI and polling

**Files:**
- Modify: `web/src/types.ts`
- Create: `web/src/library/subtitleView.ts`
- Create: `web/test/subtitle-view.test.ts`
- Modify: `web/src/pages/LibraryPage.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Produces: `SubtitleStatus = 'ready' | 'needs_mapping' | 'downloading' | 'failed'` in `web/src/types.ts`.
- Produces: `countNeedsMapping(items)` and `subtitleAction(item)` pure functions.
- Consumes: existing `api.listMedia`, `api.jimakuCandidates`, `api.jimakuDownload`.

- [x] **Step 1: Write presentation tests**

Cover the count and exact action labels:

```ts
expect(countNeedsMapping(items)).toBe(1);
expect(subtitleAction(needsMapping).label).toBe('字幕を探す');
expect(subtitleAction(downloading).label).toBe('字幕を取得中…');
expect(subtitleAction(failed).label).toBe('再試行');
expect(subtitleAction(ready).label).toBe('↺ 字幕');
```

- [x] **Step 2: Run web tests and verify RED**

Run: `npm --workspace web test -- subtitle-view.test.ts`  
Expected: FAIL because the view helper and API fields do not exist.

- [x] **Step 3: Add types and minimal pure helper**

Extend `MediaItem`:

```ts
export type SubtitleStatus = 'ready' | 'needs_mapping' | 'downloading' | 'failed';

export interface MediaItem {
  // existing fields
  subtitleStatus: SubtitleStatus;
  subtitleError: string | null;
}
```

Keep helper output limited to the label, disabled flag and whether the action uses existing mapping; do not duplicate network behavior in it.

- [x] **Step 4: Implement polling and status rendering**

In `LibraryPage`, call `refresh()` immediately, then use a 5,000ms interval with cleanup:

```ts
useEffect(() => {
  void refresh();
  const timer = window.setInterval(() => { void refresh(); }, 5_000);
  return () => window.clearInterval(timer);
}, []);
```

Render `字幕作品の選択が必要です（N件）` only when the count is nonzero. Render `downloading` as disabled, `failed` with the stored error and retry through `doDownload(mediaId)`, `needs_mapping` through current `findSubtitle`, and `ready` through current re-download flow. After manual success/failure, call `refresh()` so the persisted server state is authoritative.

- [x] **Step 5: Add narrow styles with existing variables**

Add `.library-notice`, `.subtitle-state` and `.subtitle-error` styles using only `--surface`, `--border`, `--warm`, `--text-muted` and existing spacing patterns. Do not change unrelated page layout or global colors.

- [x] **Step 6: Run web tests and production build**

Run: `npm --workspace web test && npm --workspace web run build`  
Expected: all web tests pass and Vite production build completes without TypeScript errors.

---

### Task 7: Full verification and documentation closeout

**Files:**
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/superpowers/specs/2026-07-22-local-download-pipeline-design.md`
- Modify: `docs/superpowers/specs/2026-07-23-auto-media-subtitle-design.md`

**Interfaces:**
- Consumes all completed tasks; produces the new shared project truth for Codex and Claude.

- [x] **Step 1: Run the complete automated suite**

Run: `npm test`  
Expected: server and web suites both pass with no real downloader or Jimaku dependency.

- [x] **Step 2: Run the production frontend build again after all edits**

Run: `npm --workspace web run build`  
Expected: build exits 0 and reports generated assets.

- [x] **Step 3: Verify the real browser flow**

Start the normal local app, use a small local test video in a temporary configured media directory when possible, and verify:

1. The file is absent before stability time and appears automatically afterward.
2. A no-mapping row shows the top notice plus `字幕を探す`.
3. `downloading` and failure/retry are visible without a modal.
4. Existing mapped media can complete and remove the pending state.
5. Polling updates the page, navigation away stops requests, and console has no new warning/error.

Do not start an unauthorized copyrighted download. Use fake/injected failures or a locally generated fixture for negative paths.

- [x] **Step 4: Update user and collaboration documentation**

In `README.md`, replace the manual post-download scan instruction with automatic stable-file discovery and describe manual scan as recovery. In `docs/DEVELOPMENT.md`, add the modules/table, move the feature to completed, record actual test counts and browser evidence, and remove it from “not implemented”. In the 2026-07-22 pipeline spec, link to the new design as the implemented second phase. Mark the new design status `已实施` only after verification evidence exists.

- [x] **Step 5: Review scope and working tree without committing**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only the prior resource-search work plus files directly required by this auto-scan/subtitle phase are changed. Do not commit or push until Daniel explicitly requests it.
