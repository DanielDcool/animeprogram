# アニメ / ドラマ 双模式 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有番剧应用上增加并列的「日剧」内容类型，包含独立的发现/搜索/详情/资源/字幕链路，并让全站视觉在墨黑（アニメ）与米白（ドラマ）两套主题间切换。

**Architecture:** 模式是浏览器端 UI 状态（localStorage），通过 `<html data-mode>` 驱动整套 CSS 语义 token；因为自定义属性沿 DOM 继承，播放路由只要用「有效模式」覆盖即可永远保持墨黑。服务端新增独立的 `drama` 模块（TMDB 客户端 + 手写精选清单 + 路由），复用既有的 Nyaa 资源提供器与 jimaku 字幕管线，扫描/播放/学习管线一行不动。

**Tech Stack:** Fastify + better-sqlite3 + TypeScript（server），React + React Router + Vite（web），vitest（两端），TMDB API v3（Bearer 认证），Nyaa RSS，jimaku.cc API。

**设计依据：** `docs/superpowers/specs/2026-08-14-drama-mode-design.md`。协作规则见 `AGENTS.md`，项目状态见 `docs/DEVELOPMENT.md`。

---

## 前置条件（用户操作，非编码任务）

- [ ] 用户在 https://www.themoviedb.org/settings/api 注册并取得 **API Read Access Token**（长的 JWT 形态那一串，不是短的 API Key）。本项目全程用 `Authorization: Bearer <token>`，**不把凭证放进 URL query**。
- [ ] 用户把该 token 以环境变量形式提供给 Task 5 的一次性脚本：`TMDB_TOKEN=<token>`。
- [ ] 凭证值不得进入代码、测试、文档、日志或提交信息。文档只写「配置済 / 未配置」。

---

## 文件结构

**新建（server）**

| 文件 | 职责 |
|------|------|
| `server/src/modules/drama/client.ts` | TMDB 客户端：当季/上季 discover、search、detail。归一化为 `CatalogDrama`，10 分钟进程内缓存 |
| `server/src/modules/drama/editorial.ts` | 手写日剧精选清单（零外部依赖，无 key 时的首页内容） |
| `server/src/modules/drama/routes.ts` | `/api/drama/home`、`/api/drama/search`、`/api/drama/:id`、`/api/drama/:id/resources` |
| `server/scripts/resolve-drama-picks.ts` | 一次性脚本：把剧名解析成 tmdbId + 海报 URL，输出可粘贴的 TS 条目 |
| `server/test/drama-client.test.ts` | 客户端归一化 / 缓存 / 错误映射 |
| `server/test/drama-editorial.test.ts` | 精选清单结构不变量 |
| `server/test/drama-routes.test.ts` | 有 key / 无 key 两条路径 |

**新建（web）**

| 文件 | 职责 |
|------|------|
| `web/src/mode.ts` | 模式纯逻辑：存储值归一化、有效模式推导 |
| `web/src/drama/view.ts` | 日剧展示纯函数（クール标签等） |
| `web/src/pages/DramaDiscoverPage.tsx` | 日剧发现页 |
| `web/src/pages/DramaDetailPage.tsx` | 日剧详情页 |
| `web/test/mode.test.ts` | 模式纯逻辑测试 |
| `web/test/drama-view.test.ts` | 展示纯函数测试 |

**修改**

| 文件 | 改动 |
|------|------|
| `web/src/index.css` | token 从 `:root` 迁到 `[data-mode]`，两套值；反色岛 token 重命名；播放页范围（222–464 行）**不动** |
| `web/src/components/BrandMark.tsx` | 写死颜色抽成 `--mark-block` / `--mark-cut` |
| `web/src/App.tsx` | 模式状态、切换控件、路由分发、播放页强制墨黑 |
| `web/src/api.ts` | 新增 4 个 drama 方法、settings 增加 tmdb 字段 |
| `web/src/types.ts` | `CatalogDrama` / `DramaHome` / `ContentKind` |
| `web/src/pages/SettingsPage.tsx` | TMDB token 输入项 |
| `server/src/modules/resource/provider.ts` | `ResourceCategory` 增加内容类型维度 |
| `server/src/modules/resource/nyaa.ts` | 分类表按内容类型拆成两张 |
| `server/src/modules/jimaku/client.ts` | 候选搜索合并 anime / drama |
| `server/src/modules/misc/routes.ts` | settings 读写 `tmdb_api_key` |
| `server/src/index.ts` | 注册 drama 路由 |

**不动**：`media/*`、`subtitle/*`、`analyze/*`、`ai/*`、`vocab/*`、`player/*`、`db.ts`（settings 是通用 KV 表，无需迁移）。

---

## Task 1: 模式纯逻辑

模式有两个概念要分清：**用户选择的模式**（存 localStorage）与**有效模式**（播放路由强制为 `anime`）。两者都是纯函数，可以在没有 jsdom 的 vitest 环境里测（本项目 web 测试只跑 `test/**/*.test.ts`，没有 DOM）。

**Files:**
- Create: `web/src/mode.ts`
- Test: `web/test/mode.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `web/test/mode.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTENT_MODE,
  MODE_STORAGE_KEY,
  effectiveMode,
  normalizeStoredMode,
} from '../src/mode';

describe('normalizeStoredMode', () => {
  it('accepts the two known modes', () => {
    expect(normalizeStoredMode('anime')).toBe('anime');
    expect(normalizeStoredMode('drama')).toBe('drama');
  });

  it('falls back to anime for missing or unknown values', () => {
    expect(normalizeStoredMode(null)).toBe(DEFAULT_CONTENT_MODE);
    expect(normalizeStoredMode('')).toBe('anime');
    expect(normalizeStoredMode('movie')).toBe('anime');
  });
});

describe('effectiveMode', () => {
  it('keeps the chosen mode on browsing routes', () => {
    expect(effectiveMode('drama', '/')).toBe('drama');
    expect(effectiveMode('drama', '/library')).toBe('drama');
    expect(effectiveMode('drama', '/drama/12345')).toBe('drama');
    expect(effectiveMode('anime', '/anime/999')).toBe('anime');
  });

  it('forces the player route to the ink theme in both modes', () => {
    expect(effectiveMode('drama', '/play/7')).toBe('anime');
    expect(effectiveMode('anime', '/play/7')).toBe('anime');
  });

  it('does not force look-alike paths', () => {
    expect(effectiveMode('drama', '/players')).toBe('drama');
    expect(effectiveMode('drama', '/play')).toBe('drama');
  });

  it('exposes a stable storage key', () => {
    expect(MODE_STORAGE_KEY).toBe('tanku.contentMode');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -w web -- test/mode.test.ts
```

Expected: FAIL，报错为无法解析 `../src/mode`（`Failed to resolve import`）。

- [ ] **Step 3: 写最小实现**

创建 `web/src/mode.ts`：

```ts
// アニメ / ドラマ の表示モード。
// localStorage に保存する「利用者が選んだモード」と、
// 実際に <html data-mode> へ書き込む「有効モード」を分けて扱う。
export type ContentMode = 'anime' | 'drama';

export const DEFAULT_CONTENT_MODE: ContentMode = 'anime';
export const MODE_STORAGE_KEY = 'tanku.contentMode';

export function normalizeStoredMode(value: string | null): ContentMode {
  return value === 'drama' || value === 'anime' ? value : DEFAULT_CONTENT_MODE;
}

/**
 * 播放ページは「観る」画面なので、ドラマモードでも常に墨黑を保つ。
 * 明るい面は映像のコントラストを下げ、解析パネルの「唯一の明るい面」原則も崩れるため。
 */
export function effectiveMode(mode: ContentMode, pathname: string): ContentMode {
  return pathname.startsWith('/play/') ? 'anime' : mode;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -w web -- test/mode.test.ts
```

Expected: PASS，4 个 `effectiveMode` 用例 + 2 个 `normalizeStoredMode` 用例全绿。

- [ ] **Step 5: 提交**

```bash
git add web/src/mode.ts web/test/mode.test.ts
git commit -m "feat(web): 新增アニメ/ドラマ模式纯逻辑"
```

---

## Task 2: CSS 双主题 token

这是本次改动里最需要耐心的一步。**先读设计依据**：`index.css` 开头注释描述的四构件（方块 / 缺口 / 双横眼 / 短横）与 ink/bone 两个色阶不变——变的只是「哪个色阶当底、哪个当字」。

**关键事实（已实测，决定工作量）**：

- `index.css` 共 815 行。**第 222–464 行是播放页与解析面板**，这部分被 Task 3 钉死在 `anime` 模式，**一行都不用改**（其中有 75 处 ink/bone 直接引用，全部保持原样）。
- 需要归类的只有播放页范围**之外**的 53 处：`--ink-900` 24 处、`--bone-100` 22 处、`--on-light` 3 处、`--on-light-muted` 4 处。

**归类规则**（每处只可能是这两类之一）：

| 现写法 | 语义 | 改成 |
|--------|------|------|
| `--ink-900` 当页面底色 / 缺口透出底色 | 跟底色走 | `--bg` |
| `--ink-900` 当反色块上的文字 | 反色岛 | `--on-invert` |
| `--ink-900` 当反色块自身的底 | 反色岛 | `--invert-surface` |
| `--bone-100` 当正文文字 | 跟底色走 | `--text` |
| `--bone-100` 当选中态/错误态的块底 | 反色岛 | `--invert-surface` |
| `--on-light` / `--on-light-muted` / `--light-border` | 反色岛 | `--on-invert` / `--on-invert-muted` / `--invert-border` |

判断口诀：**问「ドラマ模式下这块应该变白还是变黑」**。跟着页面走的 → 语义 token；本来就是为了和页面反差而存在的（选中导航胶囊、错误提示、解析面板）→ 反色岛 token。

**Files:**
- Modify: `web/src/index.css:10-70`（token 块）
- Modify: `web/src/index.css`（播放页范围外的 53 处引用）

- [ ] **Step 1: 替换 token 块**

把 `web/src/index.css` 第 10–70 行（从 `:root {` 到 `--stripe-dark` 所在的 `}`）整段替换为：

```css
:root {
  /* Ink — 墨黑阶（調色板。モードでは変わらない） */
  --ink-900: #0B0B0A;
  --ink-800: #141310;
  --ink-700: #232320;
  --ink-600: #33332C;
  --ink-500: #3A3A31;
  --ink-450: #4A4A42;
  --ink-400: #6B6559;
  --ink-300: #9D9C93;
  --ink-200: #A5A49A;

  /* Bone — 米白阶（調色板。モードでは変わらない） */
  --bone-050: #FBFAF7;
  --bone-100: #F2F1EA;
  --bone-200: #E6E1D6;
  --bone-300: #CFC8B8;
  --bone-400: #C2BCAE;

  /* Typography */
  --font-display: "Space Grotesk", "Noto Sans JP", sans-serif;
  --font-sans: "Noto Sans JP", "Hiragino Sans", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  /* Shape */
  --radius-xs: 3px;
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-pill: 99px;
}

/* ============================================================
   モード別セマンティックトークン
   <html data-mode="anime|drama"> で全体を切り替える。
   カスタムプロパティは継承するので、任意の要素に data-mode を
   付ければその部分木だけ別モードにできる。
   「反転の島」= ページ地色とわざと反差を作る面（選択中のナビ、
   エラー表示、解析パネル）。モードが変われば島の明暗も反転する。
   ============================================================ */
[data-mode="anime"] {
  --bg: var(--ink-900);
  --surface: var(--ink-800);
  --surface-2: var(--ink-700);
  --border: var(--ink-600);
  --border-soft: var(--ink-700);
  --border-strong: var(--bone-200);
  --text: var(--bone-100);
  --text-muted: #7A7970;
  --text-faint: var(--ink-400);
  --accent: var(--bone-200);
  --link-hover: var(--bone-300);

  /* 反転の島 */
  --invert-surface: var(--bone-100);
  --invert-surface-2: var(--bone-200);
  --on-invert: var(--ink-900);
  --on-invert-muted: #5D5849;
  --invert-border: #DCD9D2;

  /* 標識（形はモード非依存。色だけ入れ替える） */
  --mark-block: var(--bone-200);
  --mark-cut: var(--ink-800);

  --stripe-cover: repeating-linear-gradient(45deg, #1A1A17 0 10px, #141310 10px 20px);
  --shadow-card: 0 20px 44px rgba(0, 0, 0, 0.45);
}

[data-mode="drama"] {
  --bg: var(--bone-050);
  --surface: var(--bone-100);
  --surface-2: var(--bone-200);
  --border: var(--bone-300);
  --border-soft: var(--bone-200);
  --border-strong: var(--ink-600);
  --text: var(--ink-900);
  --text-muted: #5D5849;
  --text-faint: var(--ink-400);
  --accent: var(--ink-700);
  --link-hover: var(--ink-600);

  /* 反転の島 */
  --invert-surface: var(--ink-900);
  --invert-surface-2: var(--ink-700);
  --on-invert: var(--bone-100);
  --on-invert-muted: var(--ink-200);
  --invert-border: var(--ink-600);

  --mark-block: var(--ink-900);
  --mark-cut: var(--bone-050);

  --stripe-cover: repeating-linear-gradient(45deg, #EDEBE3 0 10px, #F5F3EC 10px 20px);
  /* 明るい地に黒い濃影は汚れて見えるので、影も反転側で弱める */
  --shadow-card: 0 18px 40px rgba(11, 11, 10, 0.10);
}
```

- [ ] **Step 2: 确认此时构建会红，且能定位到全部待改点**

```bash
grep -nE '\-\-(on-light|on-light-muted|light-border|stripe-dark)\)' web/src/index.css | wc -l
```

Expected: `35`（旧名总用量：`on-light` 4 + `on-light-muted` 21 + `light-border` 10）。这些变量已经不存在于新 token 块，必须全部改名。

- [ ] **Step 3: 机械重命名旧的反色岛 token**

这三个是纯改名，语义完全不变（在被钉死为 anime 的播放页里，值仍是 ink-900 / bone 系，行为不变）：

```bash
cd web/src && sed -i '' \
  -e 's/var(--on-light-muted)/var(--on-invert-muted)/g' \
  -e 's/var(--on-light)/var(--on-invert)/g' \
  -e 's/var(--light-border)/var(--invert-border)/g' \
  -e 's/var(--stripe-dark)/var(--stripe-cover)/g' \
  index.css && cd ../..
```

验证没有漏网：

```bash
grep -cE '\-\-(on-light|light-border|stripe-dark)\)' web/src/index.css
```

Expected: `0`

- [ ] **Step 4: 逐个归类播放页范围外的 53 处直接引用**

只处理 **1–221 行** 与 **465–815 行**。第 222–464 行（播放ページ / 右側解析パネル）**保持原样不要碰**。

列出待处理清单：

```bash
awk 'NR<222 || NR>464 {printf "%d:%s\n", NR, $0}' web/src/index.css | grep -E '\-\-(ink-900|bone-100)\)'
```

按 Step 0 的归类规则逐行改。已知的判定（实测取样，其余同理）：

| 行 | 现状 | 判定 | 改成 |
|----|------|------|------|
| `.nav-links a.active` 的 `background: var(--bone-100)` | 选中导航胶囊的底 | 反色岛 | `var(--invert-surface)` |
| 紧随其后的缺口 `background: var(--ink-900)` | 缺口透出页面底色 | 跟底色 | `var(--bg)` |
| `.status-message.error` 的 `background/border-color: var(--bone-100)` | 错误态最强反差 | 反色岛 | `var(--invert-surface)` |
| `.status-message.error` 的 `color: var(--ink-900)` | 反色块上的字 | 反色岛 | `var(--on-invert)` |
| `.status-message.error button:hover` 的 `background: var(--ink-900); color: var(--bone-100)` | 反色块内再反转 | 跟底色 | `background: var(--bg); color: var(--text)` |
| `.settings-error { color: var(--bone-100) }` | 页面上的正文字 | 跟底色 | `var(--text)` |

- [ ] **Step 5: 确认播放页范围没有被误改**

```bash
awk 'NR>=222 && NR<=464' web/src/index.css | grep -cE '\-\-(ink-900|bone-100)\)'
```

Expected: `47`（22 处 `--bone-100` + 25 处 `--ink-900`，与改动前一致——播放页不该有任何变化）。

再确认范围外已清零：

```bash
awk 'NR<222 || NR>464' web/src/index.css | grep -cE '\-\-(ink-900|bone-100)\)'
```

Expected: `0`

- [ ] **Step 6: 把 body 与链接接到语义 token 上**

确认 `body` 与 `a:hover` 使用 token（`a:hover` 原为写死的 `var(--bone-300)`）：

```css
body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
a { color: var(--text); text-decoration: none; }
a:hover { color: var(--link-hover); }
```

- [ ] **Step 7: 构建通过**

```bash
npm run build -w web
```

Expected: 构建成功，无 CSS 相关警告。（此时页面还没有 `data-mode` 属性，颜色会全部落空——Task 3 接上后才正常，这一步只验证语法与构建。）

- [ ] **Step 8: 提交**

```bash
git add web/src/index.css
git commit -m "refactor(web): 视觉 token 改为按 data-mode 双主题声明"
```

---

## Task 3: 接线模式切换与标识

**Files:**
- Modify: `web/src/components/BrandMark.tsx:11-12,16`
- Modify: `web/src/App.tsx`
- Modify: `web/src/index.css`（新增模式切换控件样式）

- [ ] **Step 1: 标识改用模式 token**

`web/src/components/BrandMark.tsx` 里两处写死的颜色改成 token，**形状参数一个都不动**：

第 11 行 `background: 'var(--ink-800)'` → `background: 'var(--mark-cut)'`

第 16 行 `background: 'var(--bone-200)'` → `background: 'var(--mark-block)'`

改完后文件应为：

```tsx
import type { CSSProperties } from 'react';

// 標識「タンク＝サングラス」。形はすべて標識由来: 方块 / 底辺の缺口 / 両横眼 / 短横。
// 色は --mark-block / --mark-cut に委ね、アニメ↔ドラマで反転させる（形は不変）。
export default function BrandMark({ size = 22 }: { size?: number }) {
  const w = size;
  const h = size * 0.84;
  const eyeRadius = size >= 24 ? Math.round(size * 0.055) : 0;
  const cut = (style: CSSProperties): CSSProperties => ({
    position: 'absolute',
    background: 'var(--mark-cut)',
    ...style,
  });
  return (
    <span className="brand-mark" style={{ width: w, height: h }} aria-hidden="true">
      <span style={{ position: 'absolute', inset: 0, borderRadius: size * 0.15, background: 'var(--mark-block)' }} />
      <span style={cut({ left: w * 0.38, bottom: -1, width: w * 0.24, height: h * 0.27, borderRadius: `${size * 0.07}px ${size * 0.07}px 0 0` })} />
      <span style={cut({ left: w * 0.15, top: h * 0.35, width: w * 0.26, height: h * 0.13, borderRadius: eyeRadius })} />
      <span style={cut({ right: w * 0.15, top: h * 0.35, width: w * 0.26, height: h * 0.13, borderRadius: eyeRadius })} />
      {size >= 40 && (
        <span style={cut({ left: w * 0.42, top: h * 0.59, width: w * 0.16, height: h * 0.05, borderRadius: 99 })} />
      )}
    </span>
  );
}
```

- [ ] **Step 2: App 接入模式状态与路由分发**

`web/src/App.tsx` 全文替换为：

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import LibraryPage from './pages/LibraryPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';
import VocabPage from './pages/VocabPage';
import VocabDetailPage from './pages/VocabDetailPage';
import DiscoverPage from './pages/DiscoverPage';
import DramaDiscoverPage from './pages/DramaDiscoverPage';
import AnimeDetailPage from './pages/AnimeDetailPage';
import DramaDetailPage from './pages/DramaDetailPage';
import NotFoundPage from './pages/NotFoundPage';
import BrandMark from './components/BrandMark';
import {
  MODE_STORAGE_KEY,
  effectiveMode,
  normalizeStoredMode,
  type ContentMode,
} from './mode';

/** 詳細ページは自分のモードを強制する（履歴から直接開いても配色がずれないように） */
function ForceMode(
  { mode, onForce, children }: { mode: ContentMode; onForce: (mode: ContentMode) => void; children: ReactNode },
) {
  useEffect(() => { onForce(mode); }, [mode, onForce]);
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const [mode, setMode] = useState<ContentMode>(
    () => normalizeStoredMode(localStorage.getItem(MODE_STORAGE_KEY)),
  );

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', effectiveMode(mode, location.pathname));
  }, [mode, location.pathname]);

  return (
    <div className="app">
      <nav className="topnav">
        <Link className="brand" to="/" aria-label="tanku ホーム">
          <BrandMark size={22} />
          <span className="brand-name">tanku</span>
          <span className="brand-sub">{mode === 'drama' ? 'DRAMA' : 'ANIME'}</span>
        </Link>
        <div className="mode-switch" role="group" aria-label="コンテンツの種類">
          <button
            type="button"
            className={mode === 'anime' ? 'active' : ''}
            aria-pressed={mode === 'anime'}
            onClick={() => setMode('anime')}
          >
            アニメ
          </button>
          <button
            type="button"
            className={mode === 'drama' ? 'active' : ''}
            aria-pressed={mode === 'drama'}
            onClick={() => setMode('drama')}
          >
            ドラマ
          </button>
        </div>
        <div className="nav-links">
          <NavLink to="/" end>見つける</NavLink>
          <NavLink to="/library">ライブラリ</NavLink>
          <NavLink to="/vocab">単語帳</NavLink>
          <NavLink to="/settings">設定</NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={mode === 'drama' ? <DramaDiscoverPage /> : <DiscoverPage />} />
        <Route
          path="/anime/:id"
          element={<ForceMode mode="anime" onForce={setMode}><AnimeDetailPage /></ForceMode>}
        />
        <Route
          path="/drama/:id"
          element={<ForceMode mode="drama" onForce={setMode}><DramaDetailPage /></ForceMode>}
        />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/play/:id" element={<PlayerPage />} />
        <Route path="/vocab" element={<VocabPage />} />
        <Route path="/vocab/:id" element={<VocabDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 3: 模式切换控件样式**

在 `web/src/index.css` 的「トップナビ」段落（第 80 行起）末尾追加。复用既有的胶囊 + 缺口选中态构件：

```css
/* ---- モード切替（アニメ / ドラマ） ---- */
.mode-switch {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
}
.mode-switch button {
  position: relative;
  padding: 5px 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  overflow: hidden;
}
.mode-switch button:hover { color: var(--text); }
.mode-switch button.active {
  background: var(--invert-surface);
  color: var(--on-invert);
}
/* 選択状態の底辺の缺口（標識由来の構件 02） */
.mode-switch button.active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 18px;
  height: 4px;
  border-radius: 3px 3px 0 0;
  background: var(--bg);
}
```

- [ ] **Step 4: 建两个占位页面让构建通过**

Task 11、12 会写真正的内容。先建可编译的最小版本：

`web/src/pages/DramaDiscoverPage.tsx`：

```tsx
export default function DramaDiscoverPage() {
  return <main className="discover-page"><h1>ドラマ</h1></main>;
}
```

`web/src/pages/DramaDetailPage.tsx`：

```tsx
export default function DramaDetailPage() {
  return <main className="detail-page"><h1>ドラマ詳細</h1></main>;
}
```

- [ ] **Step 5: 类型检查与构建**

```bash
npm run build -w web
```

Expected: 构建成功。

- [ ] **Step 6: 提交**

```bash
git add web/src/App.tsx web/src/components/BrandMark.tsx web/src/index.css web/src/pages/DramaDiscoverPage.tsx web/src/pages/DramaDetailPage.tsx
git commit -m "feat(web): 接入アニメ/ドラマ模式切换与主题反转"
```

---

## Task 4: TMDB 客户端

**Files:**
- Create: `server/src/modules/drama/client.ts`
- Test: `server/test/drama-client.test.ts`

**接口说明（写实现前先读）**：

- 认证：`Authorization: Bearer <API Read Access Token>`，**不用 query 参数传凭证**。
- 当季：`GET https://api.themoviedb.org/3/discover/tv?with_original_language=ja&language=ja-JP&first_air_date.gte=…&first_air_date.lte=…&sort_by=popularity.desc&page=1`
- 搜索：`GET /3/search/tv?language=ja-JP&query=…&page=1`
- 详情：`GET /3/tv/{id}?language=ja-JP&append_to_response=watch/providers`
- 图片：`https://image.tmdb.org/t/p/w500{poster_path}`、`https://image.tmdb.org/t/p/w1280{backdrop_path}`
- 评分 `vote_average` 是 0–10，归一化成 0–100 以复用既有的 `scoreLabel()`。
- 状态映射到 AniList 词汇以复用既有的 `statusLabel()`：`Returning Series` / `In Production` → `RELEASING`，`Ended` / `Canceled` → `FINISHED`，`Planned` → `NOT_YET_RELEASED`，其余 → `UNKNOWN`。
- クール与番剧季度同为自然季，直接复用 `catalog/client.ts` 的 `getSeasonPair`。

- [ ] **Step 1: 写失败的测试**

创建 `server/test/drama-client.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  createTmdbDramaCatalog,
  seasonDateRange,
  type TmdbFetch,
} from '../src/modules/drama/client.js';

function tvItem(id: number) {
  return {
    id,
    name: '日本語タイトル',
    original_name: '日本語原題',
    overview: '日本語のあらすじ。',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    vote_average: 7.8,
    first_air_date: '2026-07-04',
    genre_ids: [18],
  };
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('seasonDateRange', () => {
  it('maps each cour to its calendar quarter', () => {
    expect(seasonDateRange({ year: 2026, season: 'SUMMER' }))
      .toEqual({ gte: '2026-07-01', lte: '2026-09-30' });
    expect(seasonDateRange({ year: 2026, season: 'WINTER' }))
      .toEqual({ gte: '2026-01-01', lte: '2026-03-31' });
    expect(seasonDateRange({ year: 2025, season: 'FALL' }))
      .toEqual({ gte: '2025-10-01', lte: '2025-12-31' });
  });
});

describe('createTmdbDramaCatalog', () => {
  it('sends the bearer token and never puts it in the url', async () => {
    const fetchImpl = vi.fn<TmdbFetch>(async (url, init) => {
      expect(String(url)).not.toContain('secret-token');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
      return jsonResponse({ results: [tvItem(1)] });
    });
    const catalog = createTmdbDramaCatalog('secret-token', fetchImpl);

    await catalog.search('silent');

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('normalizes results and caches repeated home requests', async () => {
    const fetchImpl = vi.fn<TmdbFetch>(async (url) => {
      const items = String(url).includes('2026-07-01') ? [tvItem(11), tvItem(12)] : [tvItem(21)];
      return jsonResponse({ results: items });
    });
    const catalog = createTmdbDramaCatalog(
      'token',
      fetchImpl,
      () => new Date('2026-08-14T12:00:00+09:00'),
    );

    const first = await catalog.home();
    const second = await catalog.home();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
    expect(first.current).toMatchObject({ year: 2026, season: 'SUMMER' });
    expect(first.current.items[0]).toMatchObject({
      id: 11,
      title: '日本語原題',
      titleEnglish: '日本語タイトル',
      coverImage: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      bannerImage: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      score: 78,
      startDate: '2026-07-04',
      status: 'UNKNOWN',
    });
  });

  it('maps tmdb status words onto the anilist vocabulary and keeps https links only', async () => {
    const fetchImpl = vi.fn<TmdbFetch>(async () => jsonResponse({
      ...tvItem(99),
      status: 'Returning Series',
      number_of_episodes: 10,
      homepage: 'https://drama.example/official',
      networks: [{ name: 'TBS' }],
      'watch/providers': {
        results: { JP: { link: 'https://www.themoviedb.org/tv/99/watch?locale=JP' } },
      },
    }));
    const catalog = createTmdbDramaCatalog('token', fetchImpl);

    const detail = await catalog.detail(99);

    expect(detail).toMatchObject({ status: 'RELEASING', episodes: 10, network: 'TBS' });
    expect(detail?.links).toEqual([
      { site: '配信を探す（TMDB）', url: 'https://www.themoviedb.org/tv/99/watch?locale=JP', type: 'STREAMING' },
      { site: '公式サイト', url: 'https://drama.example/official', type: 'INFO' },
    ]);
  });

  it('returns null for a missing drama and raises upstream errors', async () => {
    const missing = vi.fn<TmdbFetch>(async () => new Response('{}', { status: 404 }));
    await expect(createTmdbDramaCatalog('token', missing).detail(1)).resolves.toBeNull();

    const broken = vi.fn<TmdbFetch>(async () => new Response('{}', { status: 500 }));
    await expect(createTmdbDramaCatalog('token', broken).search('x')).rejects.toThrow('TMDB returned 500');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -w server -- test/drama-client.test.ts
```

Expected: FAIL，`Failed to load ../src/modules/drama/client.js`。

- [ ] **Step 3: 写实现**

创建 `server/src/modules/drama/client.ts`：

```ts
import { cleanDescription, getSeasonPair, type SeasonRef } from '../catalog/client.js';
import { dramaEditorialNote, type DramaEditorialNote } from './editorial.js';

export interface DramaLink {
  site: string;
  url: string;
  type: 'STREAMING' | 'INFO';
}

export interface CatalogDrama {
  id: number;
  title: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  description: string;
  score: number | null;
  episodes: number | null;
  status: string;
  startDate: string | null;
  network: string | null;
  links: DramaLink[];
  recommendation?: DramaEditorialNote;
}

export interface DramaSeason extends SeasonRef {
  items: CatalogDrama[];
}

export interface DramaHome {
  current: DramaSeason;
  previous: DramaSeason;
  featured: CatalogDrama[];
  tmdbConfigured: boolean;
}

export interface DramaCatalogClient {
  home(): Promise<DramaHome>;
  search(query: string): Promise<CatalogDrama[]>;
  detail(id: number): Promise<CatalogDrama | null>;
}

export type TmdbFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class DramaUpstreamError extends Error {
  constructor(message = 'Drama catalog is unavailable') {
    super(message);
    this.name = 'DramaUpstreamError';
  }
}

const TMDB_ORIGIN = 'https://api.themoviedb.org';
const IMAGE_ORIGIN = 'https://image.tmdb.org/t/p';
const CACHE_TTL_MS = 10 * 60 * 1000;
const PER_PAGE = 20;

interface TmdbTv {
  id: number;
  name?: string | null;
  original_name?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  first_air_date?: string | null;
  number_of_episodes?: number | null;
  status?: string | null;
  homepage?: string | null;
  networks?: Array<{ name?: string | null }> | null;
  'watch/providers'?: { results?: Record<string, { link?: string | null } | undefined> | null } | null;
}

const QUARTER_RANGE = {
  WINTER: ['01-01', '03-31'],
  SPRING: ['04-01', '06-30'],
  SUMMER: ['07-01', '09-30'],
  FALL: ['10-01', '12-31'],
} as const;

/** クール（1月期/4月期/7月期/10月期）は自然四半期と一致するので、季度定義はアニメと共用できる */
export function seasonDateRange(ref: SeasonRef): { gte: string; lte: string } {
  const [from, to] = QUARTER_RANGE[ref.season];
  return { gte: `${ref.year}-${from}`, lte: `${ref.year}-${to}` };
}

/** 既存の statusLabel() をそのまま使えるよう AniList 語彙へ寄せる */
function normalizeStatus(value: string | null | undefined): string {
  if (value === 'Returning Series' || value === 'In Production') return 'RELEASING';
  if (value === 'Ended' || value === 'Canceled') return 'FINISHED';
  if (value === 'Planned') return 'NOT_YET_RELEASED';
  return 'UNKNOWN';
}

function imageUrl(path: string | null | undefined, size: 'w500' | 'w1280'): string | null {
  return path ? `${IMAGE_ORIGIN}/${size}${path}` : null;
}

function httpsLink(site: string, url: string | null | undefined, type: DramaLink['type']): DramaLink[] {
  return url?.startsWith('https://') ? [{ site, url, type }] : [];
}

function normalizeTv(tv: TmdbTv): CatalogDrama {
  const titleNative = tv.original_name ?? null;
  const titleEnglish = tv.name ?? null;
  const watchLink = tv['watch/providers']?.results?.JP?.link ?? null;
  const recommendation = dramaEditorialNote(tv.id);
  return {
    id: tv.id,
    title: titleNative ?? titleEnglish ?? `Drama ${tv.id}`,
    titleEnglish,
    titleNative,
    coverImage: imageUrl(tv.poster_path, 'w500'),
    bannerImage: imageUrl(tv.backdrop_path, 'w1280'),
    description: cleanDescription(tv.overview),
    score: tv.vote_average ? Math.round(tv.vote_average * 10) : null,
    episodes: tv.number_of_episodes ?? null,
    status: normalizeStatus(tv.status),
    startDate: tv.first_air_date || null,
    network: tv.networks?.find((n) => n.name)?.name ?? null,
    links: [
      ...httpsLink('配信を探す（TMDB）', watchLink, 'STREAMING'),
      ...httpsLink('公式サイト', tv.homepage, 'INFO'),
    ],
    ...(recommendation ? { recommendation } : {}),
  };
}

export function createTmdbDramaCatalog(
  token: string,
  fetchImpl: TmdbFetch = fetch,
  now: () => Date = () => new Date(),
): DramaCatalogClient {
  const cache = new Map<string, { expiresAt: number; value: unknown }>();

  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const value = await load();
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const url = new URL(path, TMDB_ORIGIN);
    url.search = new URLSearchParams({ language: 'ja-JP', ...params }).toString();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new DramaUpstreamError(error instanceof Error ? error.message : undefined);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new DramaUpstreamError(`TMDB returned ${response.status}`);
    try {
      return await response.json() as T;
    } catch {
      throw new DramaUpstreamError('TMDB returned invalid JSON');
    }
  }

  async function discover(ref: SeasonRef): Promise<DramaSeason> {
    return cached(`season:${ref.year}:${ref.season}`, async () => {
      const range = seasonDateRange(ref);
      const data = await get<{ results?: TmdbTv[] | null }>('/3/discover/tv', {
        with_original_language: 'ja',
        sort_by: 'popularity.desc',
        include_adult: 'false',
        page: '1',
        'first_air_date.gte': range.gte,
        'first_air_date.lte': range.lte,
      });
      return { ...ref, items: (data?.results ?? []).slice(0, PER_PAGE).map(normalizeTv) };
    });
  }

  return {
    async home() {
      const refs = getSeasonPair(now());
      const [current, previous] = await Promise.all([discover(refs.current), discover(refs.previous)]);
      return { current, previous, featured: [], tmdbConfigured: true };
    },

    async search(query: string) {
      const search = query.trim();
      return cached(`search:${search.toLocaleLowerCase()}`, async () => {
        const data = await get<{ results?: TmdbTv[] | null }>('/3/search/tv', {
          query: search,
          include_adult: 'false',
          page: '1',
        });
        return (data?.results ?? []).slice(0, PER_PAGE).map(normalizeTv);
      });
    },

    async detail(id: number) {
      return cached(`detail:${id}`, async () => {
        const tv = await get<TmdbTv>(`/3/tv/${id}`, { append_to_response: 'watch/providers' });
        return tv ? normalizeTv(tv) : null;
      });
    },
  };
}
```

- [ ] **Step 4: 建最小的 editorial 模块让 import 成立**

Task 5 会填真实内容。先建可编译的骨架 `server/src/modules/drama/editorial.ts`：

```ts
export interface DramaEditorialNote {
  badge: string;
  reason: string;
}

export function dramaEditorialNote(_id: number): DramaEditorialNote | undefined {
  return undefined;
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -w server -- test/drama-client.test.ts
```

Expected: PASS，5 个用例全绿。

- [ ] **Step 6: 提交**

```bash
git add server/src/modules/drama/client.ts server/src/modules/drama/editorial.ts server/test/drama-client.test.ts
git commit -m "feat(server): 新增 TMDB 日剧目录客户端"
```

---

## Task 5: 精选清单与一次性解析脚本

精选清单是**没有 TMDB token 时的首页内容**，也是本功能相对于「通用番剧数据库」的差异点。清单本身是原创内容，不是 TMDB 数据的镜像。

**Files:**
- Create: `server/scripts/resolve-drama-picks.ts`
- Modify: `server/src/modules/drama/editorial.ts`
- Test: `server/test/drama-editorial.test.ts`

- [ ] **Step 1: 写解析脚本**

创建 `server/scripts/resolve-drama-picks.ts`。因为 tmdbId 已逐个核实，脚本**按 id 取详情**（而不是按剧名搜索——搜索可能命中同名剧或特别篇），只负责补 `posterUrl`，并校验标题是否与本地一致：

```ts
// 一回だけ実行する補助スクリプト。
//   TMDB_TOKEN=<API Read Access Token> npx tsx scripts/resolve-drama-picks.ts
// 出力を src/modules/drama/editorial.ts に貼り付ける。
// 認証情報は環境変数からのみ読み、出力にもログにも含めない。
import { createTmdbDramaCatalog } from '../src/modules/drama/client.js';

const TITLES = [
  '重版出来!',
  'silent',
  'アンナチュラル',
  '逃げるは恥だが役に立つ',
  'カルテット',
  '半沢直樹',
  'きのう何食べた?',
  'わたし、定時で帰ります。',
];

const token = process.env.TMDB_TOKEN;
if (!token) {
  console.error('TMDB_TOKEN が設定されていません。');
  process.exit(1);
}

const catalog = createTmdbDramaCatalog(token);

for (const title of TITLES) {
  const [hit] = await catalog.search(title);
  if (!hit) {
    console.log(`// 見つかりません: ${title}`);
    continue;
  }
  console.log([
    '  {',
    `    tmdbId: ${hit.id},`,
    `    title: ${JSON.stringify(hit.titleNative ?? title)},`,
    `    posterUrl: ${JSON.stringify(hit.coverImage)},`,
    `    firstAirDate: ${JSON.stringify(hit.startDate)},`,
    "    badge: '',",
    "    reason: '',",
    '  },',
  ].join('\n'));
}
```

- [ ] **Step 2: （可延后）运行脚本补齐海报 URL**

**本步骤不阻塞后续任务。** Step 5 里的 8 个 `tmdbId` 已于 2026-08-14 在 TMDB 公开页逐个核实，不是推测值；`posterUrl` 允许为 `null`，此时封面降级为 `--stripe-cover` 底纹，功能不受影响。

等用户配好 token 后再运行，用输出里的 `posterUrl` 回填 `editorial.ts`：

```bash
TMDB_TOKEN=<token> npx tsx scripts/resolve-drama-picks.ts
```

在 `server/` 目录下运行。Expected: 输出 8 段 TS 对象字面量，带 `posterUrl`（`https://image.tmdb.org/t/p/w500/...`）。**回填时只取 `posterUrl`**——`tmdbId` 以 Step 5 中已核实的值为准，若脚本搜索命中了不同的作品（同名剧、特别篇），以已核实的 id 优先。

- [ ] **Step 3: 写失败的测试**

创建 `server/test/drama-editorial.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  DRAMA_PICKS,
  dramaEditorialNote,
  dramaFeatured,
} from '../src/modules/drama/editorial.js';

describe('drama editorial picks', () => {
  it('ships a usable hand-written list', () => {
    expect(DRAMA_PICKS.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every pick a real tmdb id, a badge and a reason', () => {
    for (const pick of DRAMA_PICKS) {
      expect(Number.isSafeInteger(pick.tmdbId) && pick.tmdbId > 0).toBe(true);
      expect(pick.title.length).toBeGreaterThan(0);
      expect(pick.badge.length).toBeGreaterThan(0);
      expect(pick.reason.length).toBeGreaterThan(0);
    }
  });

  it('only hot-links posters, never bundles image files', () => {
    for (const pick of DRAMA_PICKS) {
      if (pick.posterUrl == null) continue;
      expect(pick.posterUrl.startsWith('https://image.tmdb.org/t/p/')).toBe(true);
    }
  });

  it('has no duplicate ids', () => {
    const ids = DRAMA_PICKS.map((pick) => pick.tmdbId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes picks as catalog-shaped entries usable without a tmdb token', () => {
    const featured = dramaFeatured();
    expect(featured).toHaveLength(DRAMA_PICKS.length);
    expect(featured[0]).toMatchObject({
      id: DRAMA_PICKS[0].tmdbId,
      title: DRAMA_PICKS[0].title,
      coverImage: DRAMA_PICKS[0].posterUrl,
    });
    expect(featured[0].recommendation?.reason).toBe(DRAMA_PICKS[0].reason);
  });

  it('looks up a note by tmdb id', () => {
    expect(dramaEditorialNote(DRAMA_PICKS[0].tmdbId)?.badge).toBe(DRAMA_PICKS[0].badge);
    expect(dramaEditorialNote(-1)).toBeUndefined();
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

```bash
npm test -w server -- test/drama-editorial.test.ts
```

Expected: FAIL，`DRAMA_PICKS` / `dramaFeatured` 未导出。

- [ ] **Step 5: 写实现**

`server/src/modules/drama/editorial.ts` 全文替换。`tmdbId` / `posterUrl` / `firstAirDate` 用 Step 2 脚本输出的真实值替换下面的示例值；`badge` 与 `reason` 是原创内容，保留下面的初稿：

```ts
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
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npm test -w server -- test/drama-editorial.test.ts test/drama-client.test.ts
```

Expected: PASS，两个文件全绿。

- [ ] **Step 7: 请用户确认清单内容**

把 8 条的 `badge` / `reason` 交给 Daniel 过目并按他的判断替换。这是原创推荐内容，不是技术细节，应由他定稿。

- [ ] **Step 8: 提交**

```bash
git add server/src/modules/drama/editorial.ts server/scripts/resolve-drama-picks.ts server/test/drama-editorial.test.ts
git commit -m "feat(server): 新增学习向日剧精选清单与一次性解析脚本"
```

---

## Task 6: 日剧路由与 TMDB 设置项

**Files:**
- Create: `server/src/modules/drama/routes.ts`
- Modify: `server/src/modules/misc/routes.ts:36-77`
- Modify: `server/src/index.ts`
- Test: `server/test/drama-routes.test.ts`

**降级契约（本任务的核心）**：没有 token 时 `/api/drama/home` **返回 200 + 精选清单**，不返回 503。用户仍然能从精选进入详情、搜资源、下字幕。

- [ ] **Step 1: 写失败的测试**

创建 `server/test/drama-routes.test.ts`：

```ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { DRAMA_PICKS } from '../src/modules/drama/editorial.js';
import { dramaRoutes } from '../src/modules/drama/routes.js';
import {
  DramaUpstreamError,
  type CatalogDrama,
  type DramaCatalogClient,
} from '../src/modules/drama/client.js';

function drama(id: number): CatalogDrama {
  return {
    id,
    title: 'タイトル',
    titleEnglish: null,
    titleNative: 'タイトル',
    coverImage: null,
    bannerImage: null,
    description: 'あらすじ',
    score: 78,
    episodes: 10,
    status: 'FINISHED',
    startDate: '2026-07-04',
    network: 'TBS',
    links: [],
  };
}

async function buildTestApp(client: DramaCatalogClient | null) {
  const app = Fastify();
  await app.register(dramaRoutes, { getClient: () => client });
  return app;
}

describe('drama routes without a tmdb token', () => {
  it('serves the hand-written picks instead of failing', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({ method: 'GET', url: '/api/drama/home' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tmdbConfigured).toBe(false);
    expect(body.featured).toHaveLength(DRAMA_PICKS.length);
    expect(body.current.items).toEqual([]);
  });

  it('explains that search needs a token', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({ method: 'GET', url: '/api/drama/search?q=silent' });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('TMDB_NOT_CONFIGURED');
  });

  it('still resolves a pick detail from the local list', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({ method: 'GET', url: `/api/drama/${DRAMA_PICKS[0].tmdbId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: DRAMA_PICKS[0].tmdbId,
      title: DRAMA_PICKS[0].title,
    });
  });

  it('404s an unknown drama when nothing local matches', async () => {
    const app = await buildTestApp(null);

    const response = await app.inject({ method: 'GET', url: '/api/drama/99999999' });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('DRAMA_NOT_FOUND');
  });
});

describe('drama routes with a tmdb token', () => {
  const client: DramaCatalogClient = {
    home: async () => ({
      current: { year: 2026, season: 'SUMMER', items: [drama(11)] },
      previous: { year: 2026, season: 'SPRING', items: [drama(21)] },
      featured: [],
      tmdbConfigured: true,
    }),
    search: async () => [drama(31)],
    detail: async (id) => (id === 11 ? drama(11) : null),
  };

  it('merges live seasons with the local picks', async () => {
    const app = await buildTestApp(client);

    const body = (await app.inject({ method: 'GET', url: '/api/drama/home' })).json();

    expect(body.tmdbConfigured).toBe(true);
    expect(body.current.items).toHaveLength(1);
    expect(body.featured).toHaveLength(DRAMA_PICKS.length);
  });

  it('rejects a too-short query', async () => {
    const app = await buildTestApp(client);

    const response = await app.inject({ method: 'GET', url: '/api/drama/search?q=s' });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_QUERY');
  });

  it('maps upstream failures to 502', async () => {
    const app = await buildTestApp({
      ...client,
      search: async () => { throw new DramaUpstreamError('TMDB returned 500'); },
    });

    const response = await app.inject({ method: 'GET', url: '/api/drama/search?q=silent' });

    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('DRAMA_UNAVAILABLE');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -w server -- test/drama-routes.test.ts
```

Expected: FAIL，无法解析 `../src/modules/drama/routes.js`。

- [ ] **Step 3: 写实现**

创建 `server/src/modules/drama/routes.ts`：

```ts
import type { FastifyInstance, FastifyReply } from 'fastify';
import { DramaUpstreamError, type DramaCatalogClient } from './client.js';
import { dramaFeatured } from './editorial.js';

export interface DramaRoutesOpts {
  /** リクエストごとに解決する。設定画面でトークンを保存した直後から有効になるように */
  getClient: () => DramaCatalogClient | null;
}

const EMPTY_SEASON = { year: 0, season: 'WINTER' as const, items: [] };

export async function dramaRoutes(app: FastifyInstance, opts: DramaRoutesOpts) {
  async function run<T>(reply: FastifyReply, operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DramaUpstreamError) {
        return reply.code(502).send({
          code: 'DRAMA_UNAVAILABLE',
          error: 'ドラマ情報を取得できませんでした。しばらくしてから再試行してください。',
        });
      }
      throw error;
    }
  }

  app.get('/api/drama/home', async (_req, reply) => {
    const client = opts.getClient();
    const featured = dramaFeatured();
    // トークン未設定でもエラーにしない。手書きの厳選リストだけで学習導線は成立する。
    if (!client) {
      return { current: EMPTY_SEASON, previous: EMPTY_SEASON, featured, tmdbConfigured: false };
    }
    return run(reply, async () => ({ ...await client.home(), featured, tmdbConfigured: true }));
  });

  app.get<{ Querystring: { q?: string } }>('/api/drama/search', async (req, reply) => {
    const client = opts.getClient();
    if (!client) {
      return reply.code(503).send({
        code: 'TMDB_NOT_CONFIGURED',
        error: 'TMDB のトークンを設定すると、すべてのドラマを検索できます。',
      });
    }
    const query = req.query.q?.trim() ?? '';
    if (Array.from(query).length < 2) {
      return reply.code(400).send({ code: 'INVALID_QUERY', error: '検索語は2文字以上で入力してください。' });
    }
    return run(reply, async () => ({ items: await client.search(query) }));
  });

  app.get<{ Params: { id: string } }>('/api/drama/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    }
    const client = opts.getClient();
    const local = dramaFeatured().find((pick) => pick.id === id);
    if (!client) {
      if (local) return local;
      return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
    }
    return run(reply, async () => {
      const detail = await client.detail(id);
      if (detail) return detail;
      if (local) return local;
      return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
    });
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -w server -- test/drama-routes.test.ts
```

Expected: PASS，7 个用例全绿。

- [ ] **Step 5: settings 支持 tmdb_api_key**

修改 `server/src/modules/misc/routes.ts`：

在 `GET /api/settings` 的返回对象里，`jimaku_api_key_set` 那一行之后加：

```ts
    tmdb_api_key_set: getSetting(db, 'tmdb_api_key') != null,
```

在 `PUT /api/settings` 的 key 循环里加上新 key：

```ts
    for (const key of ['anthropic_api_key', 'deepseek_api_key', 'openai_api_key', 'gemini_api_key', 'ai_model', 'jimaku_api_key', 'tmdb_api_key'] as const) {
```

`settings` 是通用 KV 表，**不需要任何数据库迁移**。

- [ ] **Step 6: 注册路由**

修改 `server/src/index.ts`：

在 import 区加：

```ts
import { createTmdbDramaCatalog, type DramaCatalogClient } from './modules/drama/client.js';
import { dramaRoutes } from './modules/drama/routes.js';
```

在 `await app.register(resourceRoutes, …)` 之后加。客户端按 token 惰性构建并缓存，这样用户在设置页保存 token 后无需重启即可生效：

```ts
  let dramaCatalog: { token: string; client: DramaCatalogClient } | null = null;
  const getDramaClient = () => {
    const token = getSetting(db, 'tmdb_api_key');
    if (!token) return null;
    if (dramaCatalog?.token !== token) {
      dramaCatalog = { token, client: createTmdbDramaCatalog(token) };
    }
    return dramaCatalog.client;
  };
  await app.register(dramaRoutes, { getClient: getDramaClient });
```

- [ ] **Step 7: 全量测试与类型检查**

```bash
npm test -w server && npx tsc --noEmit -p server
```

Expected: 全绿，无类型错误。

- [ ] **Step 8: 提交**

```bash
git add server/src/modules/drama/routes.ts server/src/modules/misc/routes.ts server/src/index.ts server/test/drama-routes.test.ts
git commit -m "feat(server): 新增日剧目录路由与 TMDB 设置项"
```

---

## Task 7: Nyaa 分类按内容类型拆表

**这是最容易静默出错的一步。** Nyaa 真人剧子分类与动画**不是平行编号**：动画的第 1 位是 AMV，真人剧没有 AMV 而是把英译放在第 1 位。照搬「把 1 改成 4」会搜到偶像 PV 和演唱会。

**Files:**
- Modify: `server/src/modules/resource/provider.ts`
- Modify: `server/src/modules/resource/nyaa.ts:14-18,222-251`
- Modify: `server/src/modules/resource/routes.ts:18-35`
- Test: `server/test/resource-provider.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `server/test/resource-provider.test.ts` 末尾追加：

```ts
import { nyaaCategoryId } from '../src/modules/resource/provider.js';

describe('nyaaCategoryId', () => {
  it('maps anime categories', () => {
    expect(nyaaCategoryId('anime', 'all')).toBe('1_0');
    expect(nyaaCategoryId('anime', 'english')).toBe('1_2');
    expect(nyaaCategoryId('anime', 'raw')).toBe('1_4');
  });

  it('maps live action categories, which are NOT numbered in parallel with anime', () => {
    expect(nyaaCategoryId('drama', 'all')).toBe('4_0');
    // 4_1 = English-translated（アニメの 1_2 に相当）。1→4 の置換では 4_2 になり誤爆する
    expect(nyaaCategoryId('drama', 'english')).toBe('4_1');
    expect(nyaaCategoryId('drama', 'raw')).toBe('4_4');
  });

  it('never returns the idol / promotional video subcategory', () => {
    const all = (['all', 'english', 'raw'] as const).map((c) => nyaaCategoryId('drama', c));
    expect(all).not.toContain('4_3');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -w server -- test/resource-provider.test.ts
```

Expected: FAIL，`nyaaCategoryId` 未导出。

- [ ] **Step 3: 写实现**

在 `server/src/modules/resource/provider.ts` 顶部加入内容类型与分类表：

```ts
export type ResourceCategory = 'english' | 'raw' | 'all';

/** 検索対象の種類。Nyaa のカテゴリ体系が異なるため型で区別する */
export type ContentKind = 'anime' | 'drama';

// Nyaa のカテゴリ ID。アニメと実写は並行採番ではないので個別に持つ。
//   アニメ:  1_1 AMV / 1_2 English / 1_3 Non-English / 1_4 Raw
//   実写:    4_1 English / 4_2 Non-English / 4_3 Idol・PV / 4_4 Raw
// 「1 を 4 に置換」すると英語字幕が 4_2 になり、アイドル PV や別物を掴む。
const NYAA_CATEGORY_IDS: Record<ContentKind, Record<ResourceCategory, string>> = {
  anime: { all: '1_0', english: '1_2', raw: '1_4' },
  drama: { all: '4_0', english: '4_1', raw: '4_4' },
};

export function nyaaCategoryId(kind: ContentKind, category: ResourceCategory): string {
  return NYAA_CATEGORY_IDS[kind][category];
}
```

并把 `ResourceSearchOptions` 扩展为带内容类型：

```ts
export interface ResourceSearchOptions {
  season?: number;
  kind?: ContentKind;
}
```

- [ ] **Step 4: nyaa.ts 改用统一分类表**

删除 `server/src/modules/resource/nyaa.ts` 第 14–18 行本地的 `CATEGORY_IDS` 常量，改从 provider 导入：

```ts
import {
  ResourceUpstreamError,
  nyaaCategoryId,
  type ContentKind,
  type ResourceCategory,
  type ResourceProvider,
  type ResourceResult,
  type ResourceSearchOptions,
} from './provider.js';
```

`searchOne` 里的缓存键与 URL 构造改为带 kind：

```ts
    const kind: ContentKind = options.kind ?? 'anime';
    const key = `${kind}:${category}:${options.season ?? 'any'}:${query.toLocaleLowerCase()}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.items;

    const url = new URL('/', NYAA_ORIGIN);
    url.search = new URLSearchParams({
      page: 'rss',
      c: nyaaCategoryId(kind, category),
      f: '0',
      q: query,
    }).toString();
```

- [ ] **Step 5: routes.ts 改用统一分类表**

`server/src/modules/resource/routes.ts` 删除第 18–22 行本地的 `CATEGORY_IDS`，`externalSearchUrl` 改为接受 kind：

```ts
import { nyaaCategoryId, ResourceUpstreamError, type ContentKind, type ResourceCategory, type ResourceProvider } from './provider.js';

function externalSearchUrl(query: string, kind: ContentKind, category: ResourceCategory): string {
  const url = new URL('https://nyaa.si/');
  url.search = new URLSearchParams({ f: '0', c: nyaaCategoryId(kind, category), q: query }).toString();
  return url.toString();
}
```

在既有的 `/api/catalog/anime/:id/resources` 处理函数里，把两处 `externalSearchUrl(x, category)` 改为 `externalSearchUrl(x, 'anime', category)`，并把 `opts.resources.search(queries, category, { season })` 改为 `opts.resources.search(queries, category, { season, kind: 'anime' })`。

- [ ] **Step 6: 运行全量 server 测试**

```bash
npm test -w server
```

Expected: 全绿。既有的 `resource-routes.test.ts` 与 `resource-provider.test.ts` 不应有行为变化（番剧路径的分类 ID 仍是 `1_2` / `1_4` / `1_0`）。

- [ ] **Step 7: 提交**

```bash
git add server/src/modules/resource/
git commit -m "refactor(server): Nyaa 分类按内容类型拆表，锁定真人剧子分类"
```

---

## Task 8: 日剧资源搜索路由

**Files:**
- Modify: `server/src/modules/drama/routes.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/drama-routes.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `server/test/drama-routes.test.ts` 末尾追加。注意 `buildTestApp` 需要能注入资源提供器，先把它改成接受第二个参数：

```ts
import type { ResourceProvider, ResourceSearchOptions } from '../src/modules/resource/provider.js';

function fakeResources(record: { options?: ResourceSearchOptions }): ResourceProvider {
  return {
    async search(queries, _category, options = {}) {
      record.options = options;
      return { items: [], query: queries[0] ?? '' };
    },
  };
}

describe('drama resource search', () => {
  it('searches the live action category with the drama kind', async () => {
    const record: { options?: ResourceSearchOptions } = {};
    const app = Fastify();
    await app.register(dramaRoutes, {
      getClient: () => null,
      resources: fakeResources(record),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/drama/${DRAMA_PICKS[0].tmdbId}/resources`,
    });

    expect(response.statusCode).toBe(200);
    expect(record.options?.kind).toBe('drama');
    // ドラマの既定は raw（日本のテレビ録画が主流で、英語字幕は学習に不要）
    expect(response.json().category).toBe('raw');
    expect(response.json().externalSearchUrl).toContain('c=4_4');
  });

  it('rejects an unknown category', async () => {
    const app = Fastify();
    await app.register(dramaRoutes, { getClient: () => null, resources: fakeResources({}) });

    const response = await app.inject({
      method: 'GET',
      url: `/api/drama/${DRAMA_PICKS[0].tmdbId}/resources?category=bogus`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_RESOURCE_CATEGORY');
  });
});
```

同时把前面所有 `buildTestApp(client)` 调用改为传入资源提供器：

```ts
async function buildTestApp(client: DramaCatalogClient | null) {
  const app = Fastify();
  await app.register(dramaRoutes, { getClient: () => client, resources: fakeResources({}) });
  return app;
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -w server -- test/drama-routes.test.ts
```

Expected: FAIL，`resources` 不是 `DramaRoutesOpts` 的属性 / 路由 404。

- [ ] **Step 3: 写实现**

`server/src/modules/drama/routes.ts`：opts 加入资源提供器，并新增路由。

import 区补充：

```ts
import {
  ResourceUpstreamError,
  nyaaCategoryId,
  type ResourceCategory,
  type ResourceProvider,
} from '../resource/provider.js';
import { buildSeasonSearchQueries, inferSeasonNumber } from '../resource/season.js';
```

`DramaRoutesOpts` 加一个字段：

```ts
export interface DramaRoutesOpts {
  getClient: () => DramaCatalogClient | null;
  resources: ResourceProvider;
}
```

在文件末尾（`dramaRoutes` 函数内）加入路由：

```ts
  app.get<{
    Params: { id: string };
    Querystring: { category?: string };
  }>('/api/drama/:id/resources', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ code: 'INVALID_DRAMA_ID', error: '作品IDが不正です。' });
    }

    // ドラマの既定は raw。日本のテレビ録画が大半で、英語字幕は日本語学習に不要。
    const category = (req.query.category ?? 'raw') as ResourceCategory;
    if (category !== 'english' && category !== 'raw' && category !== 'all') {
      return reply.code(400).send({
        code: 'INVALID_RESOURCE_CATEGORY',
        error: 'リソース分類が不正です。',
      });
    }

    const externalUrl = (query: string) => {
      const url = new URL('https://nyaa.si/');
      url.search = new URLSearchParams({
        f: '0',
        c: nyaaCategoryId('drama', category),
        q: query,
      }).toString();
      return url.toString();
    };

    let fallbackUrl = '';
    try {
      const client = opts.getClient();
      const detail = client ? await client.detail(id) : null;
      const local = dramaFeatured().find((pick) => pick.id === id);
      const source = detail ?? local;
      if (!source) {
        return reply.code(404).send({ code: 'DRAMA_NOT_FOUND', error: '作品が見つかりません。' });
      }
      const titles = [...new Map([source.titleNative ?? source.title, source.titleEnglish]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value.toLocaleLowerCase(), value])).values()];
      const season = inferSeasonNumber(titles);
      const queries = buildSeasonSearchQueries(titles, season);
      fallbackUrl = externalUrl(queries[0] ?? '');
      const result = await opts.resources.search(queries, category, { season, kind: 'drama' });
      return {
        ...result,
        category,
        externalSearchUrl: externalUrl(result.query || queries[0] || ''),
      };
    } catch (error) {
      if (error instanceof DramaUpstreamError) {
        return reply.code(502).send({
          code: 'DRAMA_UNAVAILABLE',
          error: 'ドラマ情報を取得できませんでした。しばらくしてから再試行してください。',
        });
      }
      if (error instanceof ResourceUpstreamError) {
        return reply.code(502).send({
          code: 'RESOURCE_UNAVAILABLE',
          error: 'ダウンロード候補を取得できませんでした。Nyaa のサイトで検索してください。',
          externalSearchUrl: fallbackUrl,
        });
      }
      throw error;
    }
  });
```

- [ ] **Step 4: 更新 index.ts 的注册**

`server/src/index.ts` 里把 drama 路由注册改为共用同一个 Nyaa 提供器实例（缓存也一起复用）：

```ts
  const resources = createNyaaResourceProvider();
  await app.register(resourceRoutes, { catalog, resources });
  let dramaCatalog: { token: string; client: DramaCatalogClient } | null = null;
  const getDramaClient = () => {
    const token = getSetting(db, 'tmdb_api_key');
    if (!token) return null;
    if (dramaCatalog?.token !== token) {
      dramaCatalog = { token, client: createTmdbDramaCatalog(token) };
    }
    return dramaCatalog.client;
  };
  await app.register(dramaRoutes, { getClient: getDramaClient, resources });
```

（把 Task 6 Step 6 中写的 `createNyaaResourceProvider()` 内联调用一并替换成上面的 `resources` 变量。）

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -w server && npx tsc --noEmit -p server
```

Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add server/src/modules/drama/routes.ts server/src/index.ts server/test/drama-routes.test.ts
git commit -m "feat(server): 新增日剧资源搜索路由"
```

---

## Task 9: jimaku 合并动画与真人剧候选

jimaku.cc 同时收录动画与真人剧（`jimaku.cc/dramas` 有数千条目）。现有客户端写死 `anime=true`，只能搜到动画。

**做法**：候选搜索同时请求两种，按 entry id 合并去重。这样**媒体库不需要知道文件是番剧还是日剧**——不加字段、不加状态、不加 UI。候选本来就是「人工选一次后记住映射」，与该模式天然吻合。

**Files:**
- Modify: `server/src/modules/jimaku/client.ts:36-38`
- Test: `server/test/jimaku.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `server/test/jimaku.test.ts` 末尾追加：

```ts
describe('jimaku entry search across anime and drama', () => {
  it('queries both libraries and merges by entry id', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string | URL) => {
      const href = String(url);
      urls.push(href);
      const entries = href.includes('anime=true')
        ? [{ id: 1, name: 'Anime Entry' }, { id: 9, name: 'Shared Entry' }]
        : [{ id: 9, name: 'Shared Entry' }, { id: 2, name: 'Drama Entry' }];
      return new Response(JSON.stringify(entries), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = createJimakuClient('test-key', fetchFn);
    const entries = await client.search('silent');

    expect(urls).toHaveLength(2);
    expect(urls.some((url) => url.includes('anime=true'))).toBe(true);
    expect(urls.some((url) => url.includes('anime=false'))).toBe(true);
    expect(entries.map((entry) => entry.id)).toEqual([1, 9, 2]);
  });

  it('still returns anime results when the drama library errors', async () => {
    const fetchFn = (async (url: string | URL) => {
      if (String(url).includes('anime=false')) return new Response('nope', { status: 500 });
      return new Response(JSON.stringify([{ id: 1, name: 'Anime Entry' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = createJimakuClient('test-key', fetchFn);

    await expect(client.search('frieren')).resolves.toEqual([{ id: 1, name: 'Anime Entry' }]);
  });
});
```

确认该文件顶部已 import `createJimakuClient`、`describe`、`expect`、`it`；若缺少则补上。

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -w server -- test/jimaku.test.ts
```

Expected: FAIL，只发出 1 个请求（`urls` 长度为 1）。

- [ ] **Step 3: 写实现**

修改 `server/src/modules/jimaku/client.ts` 的 `search`。把第 37–38 行替换为：

```ts
    // アニメと実写（ドラマ）の両方を引いて統合する。
    // どちらの棚にあるかをローカル側で判定するのは不確実なので、
    // 「人が一度だけ選ぶ」既存フローに候補をまとめて出す方が確実。
    // 片方が落ちてももう片方の候補は返す。
    search: async (query) => {
      const url = (anime: boolean) =>
        `${BASE}/entries/search?anime=${anime}&query=${encodeURIComponent(query)}`;
      const [animeEntries, dramaEntries] = await Promise.all([
        getJson<JimakuEntry[]>(url(true)).catch(() => [] as JimakuEntry[]),
        getJson<JimakuEntry[]>(url(false)).catch(() => [] as JimakuEntry[]),
      ]);
      const merged = new Map<number, JimakuEntry>();
      for (const entry of [...animeEntries, ...dramaEntries]) {
        if (!merged.has(entry.id)) merged.set(entry.id, entry);
      }
      return [...merged.values()];
    },
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -w server -- test/jimaku.test.ts
```

Expected: PASS。既有的 jimaku 用例也须保持绿色。

- [ ] **Step 5: 用真实 key 确认 `anime=false` 的参数语义**

设计文档记录：`anime=false` 返回真人剧条目这一点是从 `jimaku.cc/dramas` 页面存在性推断的，**必须实测确认**。用户已配置 jimaku key 时，在浏览器里对一个日剧文件打开「字幕を探す」，确认候选中出现真人剧条目。若接口参数名不同，按实际接口调整 `url()` 并更新本计划与设计文档。凭证值不得出现在任何输出中。

- [ ] **Step 6: 提交**

```bash
git add server/src/modules/jimaku/client.ts server/test/jimaku.test.ts
git commit -m "feat(server): jimaku 候选合并动画与真人剧条目"
```

---

## Task 10: 前端类型与 API 方法

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/api.ts`

- [ ] **Step 1: 加类型**

在 `web/src/types.ts` 末尾追加。字段必须与 server 的 `CatalogDrama` / `DramaHome` 完全一致：

```ts
export interface CatalogDrama {
  id: number;
  title: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  description: string;
  score: number | null;
  episodes: number | null;
  status: string;
  startDate: string | null;
  network: string | null;
  links: CatalogLink[];
  recommendation?: { badge: string; reason: string };
}
export interface DramaSeason extends SeasonRef { items: CatalogDrama[] }
export interface DramaHome {
  current: DramaSeason;
  previous: DramaSeason;
  featured: CatalogDrama[];
  tmdbConfigured: boolean;
}
```

- [ ] **Step 2: 加 API 方法**

在 `web/src/api.ts` 的 import 中加入 `CatalogDrama`、`DramaHome`，并在 `api` 对象末尾（`catalogResources` 之后）追加：

```ts
  dramaHome: () => request('/api/drama/home').then((r) => j<DramaHome>(r)),
  dramaSearch: (query: string) =>
    request(`/api/drama/search?q=${encodeURIComponent(query)}`).then((r) => j<{ items: CatalogDrama[] }>(r)),
  dramaDetail: (id: number) => request(`/api/drama/${id}`).then((r) => j<CatalogDrama>(r)),
  dramaResources: (id: number, category: ResourceCategory) =>
    request(`/api/drama/${id}/resources?category=${encodeURIComponent(category)}`)
      .then((r) => j<ResourceSearchResponse>(r)),
```

同时把 `getSettings` 的返回类型加上新字段：

```ts
    jimaku_api_key_set: boolean;
    tmdb_api_key_set: boolean;
```

- [ ] **Step 3: 构建确认**

```bash
npm run build -w web
```

Expected: 构建成功。

- [ ] **Step 4: 提交**

```bash
git add web/src/types.ts web/src/api.ts
git commit -m "feat(web): 新增日剧类型与 API 方法"
```

---

## Task 11: 日剧展示纯函数

**Files:**
- Create: `web/src/drama/view.ts`
- Test: `web/test/drama-view.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `web/test/drama-view.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { courLabel, networkLabel, airYearLabel } from '../src/drama/view';

describe('courLabel', () => {
  it('uses the japanese drama cour convention, not the anime one', () => {
    expect(courLabel({ year: 2026, season: 'SUMMER' })).toBe('2026年 7月期');
    expect(courLabel({ year: 2026, season: 'WINTER' })).toBe('2026年 1月期');
    expect(courLabel({ year: 2025, season: 'FALL' })).toBe('2025年 10月期');
  });
});

describe('networkLabel', () => {
  it('falls back when the network is unknown', () => {
    expect(networkLabel('TBS')).toBe('TBS');
    expect(networkLabel(null)).toBe('放送局不明');
  });
});

describe('airYearLabel', () => {
  it('shows only the year from an iso date', () => {
    expect(airYearLabel('2022-10-06')).toBe('2022年');
    expect(airYearLabel(null)).toBe('');
    expect(airYearLabel('bogus')).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -w web -- test/drama-view.test.ts
```

Expected: FAIL，无法解析 `../src/drama/view`。

- [ ] **Step 3: 写实现**

创建 `web/src/drama/view.ts`：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -w web -- test/drama-view.test.ts
```

Expected: PASS，3 组用例全绿。

- [ ] **Step 5: 提交**

```bash
git add web/src/drama/view.ts web/test/drama-view.test.ts
git commit -m "feat(web): 新增日剧展示纯函数"
```

---

## Task 12: 日剧发现页

结构对齐 `DiscoverPage.tsx`，但有三点必须不同：

1. 精选区**永远显示**（没有 token 时它就是全部内容）。
2. 没有 token 时搜索框禁用并给出引导，而不是报错。
3. hero 渐变用米白 rgba（ドラマ模式是浅色底），不能照抄 `rgba(11, 11, 10, …)`。

**Files:**
- Modify: `web/src/pages/DramaDiscoverPage.tsx`（替换 Task 3 的占位）
- Modify: `web/src/index.css`

- [ ] **Step 1: 写页面**

`web/src/pages/DramaDiscoverPage.tsx` 全文替换：

```tsx
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { scoreLabel, statusLabel } from '../catalog/view';
import { airYearLabel, courLabel, networkLabel } from '../drama/view';
import type { CatalogDrama, DramaHome } from '../types';

const MARQUEE_TEXT = '生の日本語を、毎日の会話から · ';

function DramaCard({ drama }: { drama: CatalogDrama }) {
  return (
    <Link className="anime-card" to={`/drama/${drama.id}`}>
      <div className="anime-cover">
        {drama.coverImage && (
          <img
            src={drama.coverImage}
            alt=""
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        )}
        <span className="anime-score">{scoreLabel(drama.score)}</span>
      </div>
      <div className="anime-card-body">
        <h3>{drama.title}</h3>
        <p className="anime-romaji">{[airYearLabel(drama.startDate), networkLabel(drama.network)].filter(Boolean).join(' · ')}</p>
        <div className="anime-tags"><span>{statusLabel(drama.status)}</span></div>
      </div>
    </Link>
  );
}

function LoadingCards() {
  return (
    <div className="anime-grid" aria-label="読み込み中">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="anime-card skeleton-card" key={index}><div className="anime-cover" /></div>
      ))}
    </div>
  );
}

export default function DramaDiscoverPage() {
  const [home, setHome] = useState<DramaHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [season, setSeason] = useState<'current' | 'previous'>('current');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogDrama[] | null>(null);
  const [searching, setSearching] = useState(false);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setHome(await api.dramaHome());
    } catch {
      setError('ドラマ情報を取得できませんでした。ネットワークを確認して、もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadHome(); }, [loadHome]);

  async function search(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      setResults(null);
      setError('');
      return;
    }
    if (Array.from(term).length < 2) {
      setError('検索語は2文字以上で入力してください。');
      return;
    }
    setSearching(true);
    setError('');
    try {
      setResults((await api.dramaSearch(term)).items);
    } catch {
      setError('検索できませんでした。しばらくしてから再試行してください。');
    } finally {
      setSearching(false);
    }
  }

  const configured = home?.tmdbConfigured ?? false;
  const seasonalItems = useMemo(() => home?.[season].items ?? [], [home, season]);

  return (
    <main className="discover-page">
      <section className="discover-intro">
        <div>
          <p className="eyebrow">毎日の日本語を、ドラマで。</p>
          <h1>会話がそのまま<br />教材になる一本を。</h1>
        </div>
        <form className="anime-search" onSubmit={search} role="search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={configured ? '作品名を日本語で検索' : 'TMDB トークン未設定'}
            aria-label="ドラマを検索"
            disabled={!configured}
          />
          <button type="submit" disabled={searching || !configured}>{searching ? '検索中…' : '検索'}</button>
          {results && (
            <button type="button" className="quiet-button" onClick={() => { setQuery(''); setResults(null); setError(''); }}>
              厳選へ戻る
            </button>
          )}
        </form>
      </section>

      {!loading && !configured && (
        <div className="status-message" role="status">
          <p>
            TMDB のトークンを設定すると、今期のドラマ一覧と検索が使えるようになります。
            未設定のままでも、下の厳選リストから資料の検索・字幕の取得・学習まで進められます。
          </p>
          <Link className="primary-link" to="/settings">設定を開く →</Link>
        </div>
      )}

      {error && (
        <div className="catalog-error" role="alert">
          <p>{error}</p>
          {!results && <button onClick={loadHome}>再読み込み</button>}
        </div>
      )}

      {loading && !home ? <LoadingCards /> : results ? (
        <section className="catalog-section">
          <div className="section-heading">
            <div><p className="eyebrow">SEARCH</p><h2>「{query.trim()}」の検索結果</h2></div>
            <span>{results.length}作品</span>
          </div>
          {results.length ? (
            <div className="anime-grid">{results.map((drama) => <DramaCard drama={drama} key={drama.id} />)}</div>
          ) : (
            <div className="empty-catalog">該当する作品が見つかりませんでした。別の表記でも試してみてください。</div>
          )}
        </section>
      ) : home && (
        <>
          <section className="catalog-section editorial-section">
            <div className="section-heading">
              <div><p className="eyebrow">EDITOR'S PICK</p><h2>日本語学習に効くドラマ</h2></div>
              <p>職場と日常の会話という切り口で選びました</p>
            </div>
            <div className="drama-pick-grid">
              {home.featured.map((drama, index) => (
                <Link to={`/drama/${drama.id}`} className="drama-pick-card" key={drama.id}>
                  <span className="pick-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="drama-pick-body">
                    <span className="pick-badge">{drama.recommendation?.badge}</span>
                    <h3>{drama.title}</h3>
                    <p className="drama-pick-meta">{airYearLabel(drama.startDate)}</p>
                    <p>{drama.recommendation?.reason}</p>
                  </div>
                  {drama.coverImage && (
                    <img
                      className="drama-pick-poster"
                      src={drama.coverImage}
                      alt=""
                      loading="lazy"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                </Link>
              ))}
            </div>
          </section>

          {configured && (
            <section className="catalog-section">
              <div className="section-heading season-heading">
                <div><p className="eyebrow">SEASONAL</p><h2>クール別</h2></div>
                <div className="season-tabs" role="tablist" aria-label="放送時期">
                  <button className={season === 'current' ? 'active' : ''} onClick={() => setSeason('current')} role="tab" aria-selected={season === 'current'}>{courLabel(home.current)}</button>
                  <button className={season === 'previous' ? 'active' : ''} onClick={() => setSeason('previous')} role="tab" aria-selected={season === 'previous'}>{courLabel(home.previous)}</button>
                </div>
              </div>
              <div className="anime-grid">{seasonalItems.map((drama) => <DramaCard drama={drama} key={drama.id} />)}</div>
            </section>
          )}
        </>
      )}

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>{MARQUEE_TEXT.repeat(8)}</span>
          <span>{MARQUEE_TEXT.repeat(8)}</span>
        </div>
      </div>
      <footer className="catalog-footer">
        作品データ：TMDB。本製品は TMDB の API を利用していますが、TMDB による推奨・認証を受けたものではありません。
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: 加精选卡片样式**

在 `web/src/index.css` 末尾追加：

```css
/* ---- ドラマ厳選カード ---- */
.drama-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.drama-pick-card {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}
.drama-pick-card:hover { border-color: var(--border-strong); }
.drama-pick-body { flex: 1; min-width: 0; }
.drama-pick-body h3 { margin: 6px 0 2px; font-size: 17px; }
.drama-pick-body p { margin: 6px 0 0; font-size: 13px; line-height: 1.75; color: var(--text-muted); }
.drama-pick-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
}
.drama-pick-poster {
  width: 68px;
  height: 100px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--stripe-cover);
}
```

- [ ] **Step 3: 构建确认**

```bash
npm run build -w web
```

Expected: 构建成功。

- [ ] **Step 4: 提交**

```bash
git add web/src/pages/DramaDiscoverPage.tsx web/src/index.css
git commit -m "feat(web): 新增日剧发现页"
```

---

## Task 13: 日剧详情页

**Files:**
- Modify: `web/src/pages/DramaDetailPage.tsx`（替换 Task 3 的占位）

- [ ] **Step 1: 让 ResourceResults 可注入取数函数**

现状（已实测）：`ResourceResults` 的 props 是 `{ animeId: number }`，内部写死 `api.catalogResources(animeId, …)`，默认分类写死 `'english'`。调用点只有一处（`AnimeDetailPage.tsx:72`）。

修改 `web/src/catalog/ResourceResults.tsx` 第 21–51 行。prop 由 `animeId` 改名为 `subjectId`（对日剧而言 `animeId` 是错的名字），并加两个可选项。**番剧路径的默认行为必须零变化**：

```tsx
export default function ResourceResults({
  subjectId,
  defaultCategory = 'english',
  fetchResources,
}: {
  subjectId: number;
  defaultCategory?: ResourceCategory;
  fetchResources?: (category: ResourceCategory) => Promise<ResourceSearchResponse>;
}) {
  const [category, setCategory] = useState<ResourceCategory>(defaultCategory);
  const [state, setState] = useState<ResourceViewState>('idle');
  const [result, setResult] = useState<ResourceSearchResponse | null>(null);
  const [errorFallback, setErrorFallback] = useState('');

  useEffect(() => {
    setCategory(defaultCategory);
    setState('idle');
    setResult(null);
    setErrorFallback('');
  }, [subjectId, defaultCategory]);

  async function load(nextCategory = category) {
    setState('loading');
    setErrorFallback('');
    try {
      const response = fetchResources
        ? await fetchResources(nextCategory)
        : await api.catalogResources(subjectId, nextCategory);
      setResult(response);
      setState(response.items.length ? 'ready' : 'empty');
    } catch (error) {
      setResult(null);
      setErrorFallback((error as ApiFailure).body?.externalSearchUrl ?? '');
      setState('error');
    }
  }

  function changeCategory(nextCategory: ResourceCategory) {
    setCategory(nextCategory);
    if (state !== 'idle') void load(nextCategory);
  }
```

组件其余部分（第 53 行起的 JSX）不动。

同步改调用点 `web/src/pages/AnimeDetailPage.tsx:72`：

```tsx
          <ResourceResults subjectId={anime.id} />
```

- [ ] **Step 2: 写日剧详情页**

`web/src/pages/DramaDetailPage.tsx` 全文替换：

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import ResourceResults from '../catalog/ResourceResults';
import { scoreLabel, statusLabel } from '../catalog/view';
import { airYearLabel, networkLabel } from '../drama/view';
import type { CatalogDrama } from '../types';

export default function DramaDetailPage() {
  const { id } = useParams();
  const dramaId = Number(id);
  const [drama, setDrama] = useState<CatalogDrama | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDrama(await api.dramaDetail(dramaId));
    } catch {
      setError('作品情報を取得できませんでした。しばらくしてから再試行してください。');
    } finally {
      setLoading(false);
    }
  }, [dramaId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <main className="detail-page"><p className="page-label">LOADING</p></main>;

  if (error || !drama) {
    return (
      <main className="detail-page">
        <div className="catalog-error" role="alert">
          <p>{error || '作品が見つかりません。'}</p>
          <button onClick={load}>再試行</button>
        </div>
        <Link className="quiet-button" to="/">見つけるへ戻る</Link>
      </main>
    );
  }

  return (
    <main className="detail-page">
      <p className="page-label">DRAMA</p>
      <section className="detail-head">
        {drama.coverImage && <img className="detail-cover" src={drama.coverImage} alt="" />}
        <div>
          <h1>{drama.title}</h1>
          {drama.titleEnglish && drama.titleEnglish !== drama.title && (
            <p className="anime-romaji">{drama.titleEnglish}</p>
          )}
          <div className="detail-meta">
            <span>SCORE {scoreLabel(drama.score)}</span>
            <span>{statusLabel(drama.status)}</span>
            <span>{networkLabel(drama.network)}</span>
            {airYearLabel(drama.startDate) && <span>{airYearLabel(drama.startDate)}</span>}
            {drama.episodes != null && <span>全{drama.episodes}話</span>}
          </div>
          {drama.recommendation && (
            <p className="detail-reason">
              <span className="pick-badge">{drama.recommendation.badge}</span>
              {drama.recommendation.reason}
            </p>
          )}
        </div>
      </section>

      {drama.description && <section className="detail-synopsis"><p>{drama.description}</p></section>}

      {drama.links.length > 0 && (
        <section className="detail-links">
          <p className="eyebrow">WATCH</p>
          <div className="link-row">
            {drama.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener">{link.site}</a>
            ))}
          </div>
        </section>
      )}

      <ResourceResults
        subjectId={drama.id}
        defaultCategory="raw"
        fetchResources={(category) => api.dramaResources(drama.id, category)}
      />

      <Link className="quiet-button" to="/library">ライブラリへ →</Link>
    </main>
  );
}
```

- [ ] **Step 3: 确认番剧路径未退化**

```bash
grep -n "ResourceResults" web/src/pages/AnimeDetailPage.tsx
```

Expected: 第 72 行为 `<ResourceResults subjectId={anime.id} />`，没有其它调用点。番剧详情页的默认分类仍是 `english`，取数仍走 `api.catalogResources`。

- [ ] **Step 4: 构建与全量测试**

```bash
npm run build -w web && npm test
```

Expected: 构建成功；server 与 web 测试全绿。

- [ ] **Step 5: 提交**

```bash
git add web/src/pages/DramaDetailPage.tsx web/src/catalog/ResourceResults.tsx
git commit -m "feat(web): 新增日剧详情页"
```

---

## Task 14: 设置页 TMDB 项

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`

照搬现有 jimaku key 那一组的结构（state 两个、load 里读一次、save 里写一次、JSX 一个 password 输入框）。**不回显 token 值**，只显示「設定済み」。

- [ ] **Step 1: 加 state**

在 `const [jimakuKey, setJimakuKey] = useState('');`（第 21 行）之后加：

```tsx
  const [tmdbKeySet, setTmdbKeySet] = useState(false);
  const [tmdbKey, setTmdbKey] = useState('');
```

- [ ] **Step 2: load 里读取状态**

在 `setJimakuKeySet(s.jimaku_api_key_set);`（第 42 行）之后加：

```tsx
      setTmdbKeySet(s.tmdb_api_key_set);
```

- [ ] **Step 3: save 里写入并清空输入**

在 `if (jimakuKey) payload.jimaku_api_key = jimakuKey;`（第 61 行）之后加：

```tsx
    if (tmdbKey) payload.tmdb_api_key = tmdbKey;
```

在 `setJimakuKeySet(jimakuKeySet || jimakuKey !== ''); setJimakuKey('');`（第 73 行）之后加：

```tsx
      setTmdbKeySet(tmdbKeySet || tmdbKey !== ''); setTmdbKey('');
```

- [ ] **Step 4: 加输入框**

在 jimaku 输入框那个 `<p>…</p>` 块之后、`AI モデル` 块之前插入：

```tsx
      <p>
        <label>TMDB API Read Access Token {tmdbKeySet && '（設定済み）'}<br />
          <input type="password" value={tmdbKey} placeholder={tmdbKeySet ? '変更する場合のみ入力' : 'themoviedb.org の設定 → API から取得'} onChange={(e) => setTmdbKey(e.target.value)} style={{ width: 360 }} />
        </label>
      </p>
      <p className="settings-help">
        ドラマの今期一覧と検索に使います。未設定でも、厳選リストからの資料検索・字幕取得・学習はそのまま使えます。
        設定ページの「API キー」ではなく、長い方の「API Read Access Token」をコピーしてください。
      </p>
```

- [ ] **Step 5: 构建确认**

```bash
npm run build -w web
```

Expected: 构建成功。

- [ ] **Step 6: 提交**

```bash
git add web/src/pages/SettingsPage.tsx
git commit -m "feat(web): 设置页新增 TMDB token 配置项"
```

---

## Task 15: 浏览器验证（反色逐页核对）

自动测试无法发现「白底白字」。这一步必须人眼过。

**前置**：`npm start`，浏览器打开 http://localhost:5173。

- [ ] **Step 1: 白底白字自动初筛**

切到ドラマ模式后，在浏览器控制台运行下面的脚本，逐页执行。它找出前景与背景亮度过近的元素：

```js
[...document.querySelectorAll('*')].filter((el) => {
  const s = getComputedStyle(el);
  const lum = (c) => {
    const m = c.match(/\d+/g);
    if (!m) return null;
    return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255;
  };
  const fg = lum(s.color);
  let node = el, bg = null;
  while (node && bg == null) {
    const c = getComputedStyle(node).backgroundColor;
    if (c && !c.includes('rgba(0, 0, 0, 0)')) bg = lum(c);
    node = node.parentElement;
  }
  return fg != null && bg != null && Math.abs(fg - bg) < 0.2 && el.textContent.trim().length > 0;
}).map((el) => `${el.tagName}.${el.className}`);
```

Expected: 空数组。非空则按输出的选择器回到 Task 2 的归类规则修正。

- [ ] **Step 2: 逐页目视核对（两个模式各走一遍）**

- [ ] 見つける（アニメ / ドラマ 各一次）
- [ ] 作品詳細（`/anime/:id` 与 `/drama/:id`）
- [ ] ライブラリ
- [ ] 単語帳（列表与详情）
- [ ] 設定
- [ ] 404（访问 `/nope`）

每页确认：正文可读、选中态胶囊有缺口、边框可见、错误提示是最强反差、标识形状未变形。

- [ ] **Step 3: 播放页保持墨黑**

在ドラマ模式下打开任一 `/play/:id`。确认：整页（含顶部导航）为墨黑，右侧解析面板为米白亮岛。退出播放页后恢复米白模式。

**静音要求**：不要播放媒体。用暂停态确认样式即可。若验证过程改变了观看进度，结束前恢复原值。

- [ ] **Step 4: 日剧真实链路**

- [ ] 未配置 TMDB token 的状态下，ドラマ首页显示 8 条精选、无报错、搜索框禁用并有引导
- [ ] 配置 token 后，クール别显示真实当季日剧
- [ ] 搜索一个真实剧名返回结果
- [ ] 打开一部剧的详情 → 资源搜索返回真实 Live Action 候选，**确认不是偶像 PV 或演唱会**
- [ ] 控制台无 warning / error

- [ ] **Step 5: 记录实际结果**

把实际观察到的结果（而非「应该通过」）记入 Task 16 的文档更新。

---

## Task 16: 文档与署名

**Files:**
- Modify: `docs/DEVELOPMENT.md`
- Modify: `README.md`、`README.zh-CN.md`、`README.ja.md`

- [ ] **Step 1: 更新 DEVELOPMENT.md**

- §2 架构总览：`server/src/modules/` 加 `drama/` 一行；`web/src/` 加 `mode.ts`、`drama/view.ts`、两个新页面
- §2 SQLite 表说明：settings 的键列表加 `tmdb_api_key`
- §3 已完成功能表：加「アニメ/ドラマ 双模式」与「日剧发现・搜索・资源・字幕」两行
- §3 已验证基线：加 Task 15 的**实际**结果（含未闭环项）
- §4 关键决策记录：加三条——(1) 不镜像 TMDB 目录、只手写精选（附条款依据）；(2) 播放页在两模式下都墨黑及其理由；(3) Nyaa 真人剧分类非平行编号
- §5 已知小问题：加「TMDB 日语简介覆盖率非 100%」「日剧做种数低，老剧可能无候选」「ドラマ 默认 raw 分类待真实使用验证」
- §7 开发约定：测试数量以实际 `npm test` 输出为准

- [ ] **Step 2: 三语 README 同步**

按 `CONTRIBUTING.md` 的要求，用户可见改动必须同步中、日、英三份 README。每份加入：

- 功能说明：アニメ / ドラマ 两个模式及其切换方式
- TMDB token 为**可选**配置，未配置时仍可使用精选清单完成学习闭环
- **TMDB 署名**（条款要求）：`This product uses the TMDB API but is not endorsed or certified by TMDB.` 及对应中日文表述

- [ ] **Step 3: 全量验证**

```bash
npm test && npx tsc --noEmit -p server && npm run build -w web
```

Expected: 全绿。记录实际测试数量，不要照抄旧文档里的数字。

- [ ] **Step 4: 提交**

```bash
git add docs/DEVELOPMENT.md README.md README.zh-CN.md README.ja.md
git commit -m "docs: 记录双模式与日剧功能，补充 TMDB 署名"
```

---

## 完成标准

- [ ] `npm test` 全绿（server + web），`npx tsc --noEmit -p server` 与 `npm run build -w web` 通过
- [ ] 两个模式下逐页无白底白字，播放页在两模式下都是墨黑
- [ ] 未配置 TMDB token 时ドラマ模式可用，且能从精选走到资源搜索
- [ ] 日剧资源搜索返回真实 Live Action 候选，不是偶像 PV
- [ ] jimaku 的 `anime=false` 语义已用真实 key 确认（或按实测调整并更新文档）
- [ ] 番剧侧全部现有行为零变化
- [ ] 凭证值未出现在任何代码、测试、文档、日志或提交中
