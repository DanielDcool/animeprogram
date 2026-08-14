# アニメ / ドラマ 双模式 设计

> 状态：已确认（2026-08-14，用户批准该范围）。
> 背景见 `docs/DEVELOPMENT.md` §1 项目定位与 §8 后续设计原则。
> 本设计新增「日剧」作为与番剧并列的内容类型，并把全站视觉切换为可反转的双主题。
> 不覆盖非日语内容、追剧列表、媒体库内容类型区分。

## 目标

1. **只覆盖日剧**。日剧减少的学习摩擦是真实且区别于番剧的：现代口语、职场与日常场景、
   自然语速，直接对应用户即将进入的日企环境。欧美剧/华语剧走这条管线拿不到日语字幕，
   学习闭环断在第一步，因此明确排除。
2. **模式切换 + 整站黑白反转**。アニメ = 墨黑底米白字（现状），ドラマ = 米白底墨黑字。
   标识形状不变，只反转配色。
3. **没有 TMDB key 也能完成学习闭环**。未配置时显示手写精选清单，仍可搜资源、下字幕、
   播放、分词、收藏生词。

## 非目标

- 不做媒体库的内容类型区分。文件就是文件，`media` 表不加 kind 字段。
- 不做日剧的「追剧」列表、TMDB 人物/演员数据、评分投票。
- 不把 TMDB 目录数据镜像进仓库（见「关键约束」）。
- 不改动 scanner / remux / 播放器 / 学习模式 / 生词本 / Anki 的任何行为。

## 关键约束（已核实，不是推测）

### TMDB 条款：可缓存，不可再分发

[TMDB API Terms of Use](https://www.themoviedb.org/api-terms-of-use) 明确禁止
「Cache, for longer than 6 months, any information obtained through or from TMDB or the TMDB APIs」，
且 TMDB Content 不得 sublicense。

因此**放弃「拉一次数据当默认模板提交进仓库」的方案**（用户 2026-08-14 提出，核实后否决）：

1. 提交进公开仓库属于再分发，条款不允许。
2. 快照 6 个月后在条款层面即过期。
3. 日剧按クール（1月期/4月期/7月期/10月期）更新，快照一季就过时，
   首页显示半年前的剧比空着更糟。
4. 与 `DEVELOPMENT.md` §8「发现数据少取、短缓存、不囤积……不把外部目录当作
   可永久镜像的项目资产」直接冲突。

**替代方案**：手写精选清单（见「设计 3」）。运行时缓存沿用 AniList 的 10 分钟
进程内缓存，远在 6 个月上限内。仓库需加 TMDB 署名声明（做法与既有 JMdict
EDRDG / CC BY-SA 署名一致）。

### 海报：存 URL，不存图片文件

日剧海报是电视台与制作委员会的版权素材，放进 MIT 公开仓库是版权问题，
且与 §6.4「README 截图不能纳入未授权素材」的既定立场冲突。

精选清单只存 `image.tmdb.org` 的海报 URL，浏览器运行时直接加载——
**这与番剧侧现状一致**（AniList `coverImage.extraLarge` 从来不进仓库）。
加载失败时降级到现有的封面底纹（`--stripe-*`），列表功能不受影响。

### Nyaa 真人剧分类与动画不平行编号（已核实）

| 用途 | アニメ | Live Action |
|------|--------|-------------|
| 全部 | `1_0` | `4_0` |
| 英文字幕 | `1_2` | **`4_1`** |
| 非英文字幕 | `1_3` | **`4_2`** |
| Raw | `1_4` | **`4_4`** |
| 第 1 位 | `1_1` AMV | `4_3` Idol/PV |

「把 1 改成 4」会静默搜到偶像 PV 与演唱会。必须按上表逐项映射，并有回归测试锁定。

### jimaku 收录真人剧（已核实）

[jimaku.cc/dramas](https://jimaku.cc/dramas) 是真实存在的真人剧字幕库，数千条目，
`相棒`、`ドクターX` 等在列，时间戳至 2026 年。现有客户端写死 `anime=true`，
需要放开（见「设计 5」）。**这是本功能成立的前提。**

## 设计 1：模式状态与路由

新增 `web/src/mode.ts`（纯模块，可测）：

- `type ContentMode = 'anime' | 'drama'`
- 读写 localStorage（与字幕常显开关、分栏宽度一致的做法；**不进 SQLite**，
  这是浏览器 UI 偏好而非应用配置）
- 非法值、缺失值一律回退 `'anime'`
- 提供把 `data-mode` 写到 `document.documentElement` 的副作用函数（与纯逻辑分离）

路由：

| 路径 | 行为 |
|------|------|
| `/` | 按当前模式渲染 `AnimeDiscover` 或 `DramaDiscover` |
| `/anime/:id` | 番剧详情，**进入时强制 mode=anime** |
| `/drama/:id` | 日剧详情，**进入时强制 mode=drama** |
| 其余 | 不变 |

详情页强制设定模式，是为了避免从浏览器历史直接打开详情页时出现
「白底显示番剧」的错乱状态。

## 设计 2：主题反转

token 声明从 `:root` 改挂到 `[data-mode]` 属性选择器：

```css
[data-mode="anime"] { --bg: var(--ink-900); --text: var(--bone-100); … }
[data-mode="drama"] { --bg: var(--bone-050); --text: var(--ink-900); … }
```

`<html data-mode="…">` 控制全局。因为 CSS 自定义属性沿 DOM 继承，
**播放页只需包一层 `<div data-mode="anime">`，整棵子树即恢复墨黑**，
无需复制任何 CSS 规则。

### 播放页在两个模式下都保持墨黑（已确认）

理由：

1. 播放页是「看」的界面，不是「逛」的界面。白底在暗环境下刺眼，且拉低画面对比度。
2. 现有设计原则是「解析面板整面反转为米白，是页面上唯一的大面积亮色，
   用来强调学习内容优先级」。若播放页跟随反转，解析面板会变成暗岛，该原则反向失效。
3. 产品语义上，进入播放器变暗本身就是「进入沉浸模式」的信号。

### 必须完成的 token 整理

这是本次改动的主要工作量。机械但必须逐项判断，归类错误会产生白底白字。

| 项目 | 数量 | 处理 |
|------|------|------|
| 直接写 `--ink-900` | ~50 处 | 逐个归类：跟底色走 → 语义 token；属于反色岛 → 反色岛 token |
| 直接写 `--bone-100` | ~45 处 | 同上 |
| `--on-light` / `--on-light-muted` / `--light-border` | ~38 处 | 重命名为 `--on-invert` / `--on-invert-muted` / `--invert-border`。ドラマ模式下这块岛是**暗的**，叫 "light" 是错误命名 |
| `--stripe-dark` | 5 处 | 改名 `--stripe-cover`，两模式各一套值 |
| `BrandMark` 写死的 `--ink-800` / `--bone-200` | 2 处 | 抽成 `--mark-block` / `--mark-cut`，**形状参数一行不动** |
| 导航 `brand-sub` 文案 | 1 处 | `ANIME` / `DRAMA` 随模式切换 |

ink / bone 两个原始色阶本身不动——它们是调色板，不是语义。

模式切换控件放顶部导航，复用既有的「缺口」选中态构件，与现有导航胶囊一致。

## 设计 3：日剧数据源

新增 `server/src/modules/drama/`，结构照搬 `catalog/`：

| 文件 | 职责 |
|------|------|
| `client.ts` | TMDB 客户端。`discover/tv` + `with_original_language=ja` + `language=ja-JP` 取当季/上季；`search/tv`；`tv/:id`（带 `watch/providers`，`watch_region=JP`）。归一化成 `CatalogDrama`，10 分钟进程内缓存。失败抛 `DramaUpstreamError` |
| `editorial.ts` | **手写精选清单**，零外部依赖。字段：日文原题 / 推荐理由 / 难度 / 海报 URL / tmdbId |
| `routes.ts` | `/api/drama/home`、`/api/drama/search`、`/api/drama/:id`、`/api/drama/:id/resources` |

`CatalogDrama` 字段对齐现有 `CatalogAnime`（id / title / titleNative / titleEnglish /
coverImage / description / score / episodes / status / startDate / links），
`studio` 位置改放**电视台**（TBS / フジ / 日テレ / テレ朝），语义等价，
前端展示组件可最大程度复用。

### 降级行为（核心）

| TMDB key | `/api/drama/home` | 搜索 | 详情 |
|----------|-------------------|------|------|
| 未配置 | 只返回 `editorial` 精选，**不报错、不返回 503** | 提示「配置 TMDB key 后可搜索全部日剧」 | 精选内的剧显示本地字段（标题/理由/海报） |
| 已配置 | 精选 + 当季 + 上季实时数据 | 全量搜索 | 完整（日语简介、电视台、集数、JP 区配信入口） |

**未配置时闭环仍然完整**：精选清单里的剧照样能搜资源（Nyaa）、下字幕（jimaku）、
播放、分词、收藏生词——这两条链路都不经过 TMDB。

设置页新增 `tmdb_api_key`，存 `settings` 表，页面只显示「配置済 / 未配置」，
不回显 key 值（与既有 5 个 key 的处理一致）。

意外收益：TMDB 的 `language=ja-JP` 让日剧简介**本身就是日语**，
可直接作为学习材料——而 `DEVELOPMENT.md` §5 记录的「AniList 简介多数是英文」
正是番剧侧的现存问题。

## 设计 4：资源搜索

`resource/nyaa.ts` 的 `CATEGORY_IDS` 由单表改为按内容类型两表（值见「关键约束」）。
排序、季度过滤、info hash 校验、magnet 构造、5 分钟缓存**全部复用**，不复制逻辑。

`/api/drama/:id/resources` 取标题的来源：已配置 key 时用 TMDB detail 的
日文原题 / 英文名；未配置时用 editorial 的日文原题。其余流程与
`/api/catalog/anime/:id/resources` 一致。

**ドラマ默认分类为 `raw`（`4_4`）**，与番剧默认 `english` 不同。理由：
日剧在 Nyaa 上绝大多数是日本电视台的 raw 录制，英译版稀少；学日语也不需要
内嵌英文字幕，日语字幕走 jimaku。`all`（`4_0`）会混入 `4_3` 偶像 PV，
仅在用户显式选择时使用。该默认值属于可按真实使用调整的参数。

季度推断 `resource/season.ts` **直接复用**：`ドクターX シーズン8`、
`相棒 season 23` 等命中现有规则，无需新代码。

## 设计 5：字幕

`jimaku/client.ts` 的 `search()` 现在写死 `anime=true`。改为
**同时请求 `anime=true` 与 `anime=false`，按 entry id 合并去重**。

选择这个做法而非「把内容类型一路传下来」，理由：

1. **媒体库完全不需要知道一个文件是番剧还是日剧**——不加字段、不加状态、不加 UI。
2. 候选列表本来就是「人工选一次，之后记住映射」（§8 既定原则），
   合并候选与该原则天然吻合。
3. 番剧侧行为不退化：原有候选一条不少，只是多了日剧候选。

代价：每次候选搜索多一个 HTTP 请求。jimaku 限速 25 req/分，
而候选搜索是罕见的手动操作，无实际影响。

`jimaku_mapping` 表结构不变（series → entry_id 的映射与内容类型无关）。

## 不改动的部分

scanner / remux / ffprobe / watcher / 播放器 / `learningMode` reducer /
kuromoji 分词 / JMdict / AI 讲解 / 生词本 / Anki / 观看进度。

**日剧文件走的是与番剧完全相同的管线**——这是本功能可以低成本实现的根本原因，
也是它符合「统一导入管线」原则（§8）的体现。

## 需要用户提供

1. **TMDB API key**（用户自行注册并在设置页配置；协作方不接触 key 值）。
2. **8–10 部日剧的精选清单**：剧名 + 一两句「为什么适合学日语」。
   海报 URL 与 tmdbId 由实现方用已配置的 key 查询一次后填入 `editorial.ts`。

## 测试与验证

按 §7 开发约定，纯逻辑先写 vitest，外部依赖注入 fake：

- `drama/client.ts`：归一化、缓存命中、上游错误映射（注入 fake fetch，不打真实网络）
- 分类映射表：锁定 `4_1 / 4_2 / 4_4`，**专门防「把 1 改成 4」这个坑**
- `mode.ts`：读写、非法值回退、持久化
- `drama/routes.ts`：有 key / 无 key 两条路径，未配置时返回精选而非错误
- `jimaku/client.ts`：合并去重逻辑

浏览器实测（`npm start`）：

1. 两个模式来回切换，**逐页检查有无白底白字**（发现 / 详情 / 媒体库 / 生词本 / 设置 / 404）
2. 播放页在 ドラマ 模式下仍为墨黑，解析面板仍为亮岛
3. 日剧搜索返回真实 TMDB 结果；资源搜索返回真实 Live Action 候选且非 Idol/PV
4. 未配置 key 的实例显示精选清单且无错误提示

**全程静音**：不播放媒体；如需确认播放页样式，使用暂停态。若验证改变观看进度，结束前恢复原值。

## 风险与未决

- **token 归类错误会产生白底白字，自动测试无法覆盖**，只能逐页人眼核对。
  这是本次最耗时的部分，不是技术难点但不可省略。
- TMDB 的日语简介覆盖率非 100%，冷门剧可能只有英文；届时按现有 `cleanDescription` 照常显示，不自动翻译。
- 日剧在 Nyaa 上的做种数普遍低于热门番剧，老剧可能无候选；保留现有「回退到 Nyaa 站内搜索链接」。
- jimaku 的 `anime=false` 参数语义由 `/dramas` 页面存在性推断，
  **实现时需用真实 key 发一次请求确认**，若参数名不同则按实际接口调整。
- ドラマ 默认分类 `raw` 属于经验判断，需真实使用后确认是否调整。
