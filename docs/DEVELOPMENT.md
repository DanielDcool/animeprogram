# 开发与产品交接文档

> 这是 Codex 与 Claude 共用的项目状态、关键决策和未来设计的唯一事实源。每次功能迭代后更新。
> 新会话接手工作前还应先读仓库根目录 `AGENTS.md`。历史设计过程见
> `docs/superpowers/specs/2026-07-21-jp-learning-player-design.md`（MVP 设计）与
> `docs/superpowers/plans/2026-07-21-jp-learning-player-mvp.md`（MVP 实现计划，已全部完成）。
> 动画发现功能见 `docs/superpowers/specs/2026-07-22-anime-discovery-design.md` 与对应 plan。
>
> 最后校对：2026-07-22。

## 0. 如何使用这份文档

- 本文件回答：项目现在是什么、为何这样设计、目前哪里有问题、下一步准备做什么。
- `README.md` 回答：用户如何安装和使用。
- `docs/superpowers/specs/` 与 `docs/superpowers/plans/` 保存历史设计和计划，不代表当前进度。
- 代码和测试是运行行为的最终事实。若发现它们与本文件不一致，先说明冲突，再随本次改动校正文档。
- 接手时先执行 `git status --short`，不要覆盖用户或另一个 AI 的未提交改动。
- 应用通过设置页将 API key 写入本地 SQLite；协作时只能确认是否配置，绝不输出、复制或写入文档。

## 1. 项目定位

集动画发现与看番学日语于一体的本地 Web 应用，**两端都是核心功能**（发现是刻意纳入的，
不是附属工具）。发现端解决“这季看什么、在哪里官方观看”，并且是学习闭环的入口——目标是
帮用户找到**难度合适、值得沉浸**的番，而不只是通用浏览。学习端服务于「无阻沉浸」学习法：
**默认不显示字幕**，尽量靠听；没听懂时暂停 → 显示当前句 → 右侧面板分词/查词/AI 语法讲解 → 收藏生词 → 继续。
用户 Daniel（N1、后端工程师）自用，宁可简单能用，不要过度设计。迭代方式：先做 MVP，实际使用后调整。

## 2. 架构总览

本地双进程：`npm start` 同时起 server(3001) 与 web(5173，/api 代理到 3001)。

```
server/src/
  index.ts               Fastify 启动 + 全部路由注册
  config.ts              端口 / MEDIA_DIR(~/AnimeLibrary) / DATA_DIR(server/data)
  db.ts                  better-sqlite3 打开 + 全部建表（IF NOT EXISTS，改表结构直接加在这里）
  modules/
    media/     filename.ts(文件名→series/episode) ffmpeg.ts(probe/remux命令,纯函数+执行分离)
               scanner.ts(扫描导入,FfmpegOps 依赖注入) routes.ts(列表/scan/Range流)
    subtitle/  parser.ts(srt+ass→Cue{start,end,text}) routes.ts(句子列表+偏移)
    analyze/   tokenizer.ts(kuromoji惰性单例) dictionary.ts(JMdict查词)
               jmdict-import.ts(流式导入) routes.ts(/api/analyze)
    ai/        explain.ts(Claude API, structured outputs) routes.ts(/api/explain, SQLite缓存)
    jimaku/    client.ts(jimaku.cc API + pickBestFile) routes.ts(candidates/download)
    catalog/   client.ts(AniList GraphQL + normalize + 10分钟缓存)
               editorial.ts(本地学习向推荐理由) routes.ts(/api/catalog/*)
    vocab/     routes.ts(收藏 CRUD + TSV 导出)
    misc/      routes.ts(progress + settings)
web/src/
  api.ts                 唯一的后端调用出口（所有 fetch 都在这）
  pages/                 DiscoverPage / AnimeDetailPage / LibraryPage / PlayerPage / VocabPage / SettingsPage
  catalog/               view.ts（季度、状态和评分显示的纯函数）
  player/                learningMode.ts(纯reducer,核心状态机) AnalysisPanel / TranscriptList / SubtitleOverlay
```

SQLite 表：`media, subtitle_file, progress, explain_cache, settings, dict, jimaku_mapping, vocab`
（settings 存 `anthropic_api_key` / `jimaku_api_key` / `ai_model`，凭证值不得进入日志、测试或文档）。

## 3. 已完成功能

| 功能 | 关键位置 |
|------|----------|
| 媒体扫描：mkv 自动 remux 成 .play.mp4、抽内嵌字幕、外部 `.ja.srt` 优先 | media/scanner.ts |
| H.265/10bit 标记「要トランスコード」不播放（提示换源，MVP 不转码） | media/ffmpeg.ts decidePlayability |
| 学习模式：默认无字幕；Space 暂停+显示；A 回句首；←/→ 跳句；S 常显；[ ] 偏移±100ms | player/learningMode.ts + PlayerPage |
| 右侧面板双 Tab：解析（分词chip+词卡+AI讲解）/ 字幕一覧（T 键，当前句自动滚动，点句=SELECT跳转+暂停+解析） | AnalysisPanel / TranscriptList |
| 本地分析：kuromoji 分词+变形还原，JMdict 查词（需手动导入，见 README） | analyze/* |
| AI 深度讲解：D 键，claude-opus-4-8 + json_schema 输出{翻译/语法结构/表现/语气}，按句哈希缓存 | ai/explain.ts |
| jimaku 字幕匹配：候选选择一次→jimaku_mapping 记住→按 episode 自动下载(.srt优先,跳过压缩包) | jimaku/* |
| 生词本：词/句收藏（带出处+时间戳，去重），単語帳页面，Anki TSV 导出 | vocab/routes.ts + VocabPage |
| 观看进度：5 秒一存，媒体库显示「続き」 | misc/routes.ts |
| 动画发现：首页实时显示当前季/上季、学习向 3 部推荐、日/英/罗马字搜索、响应式卡片 | catalog/* + DiscoverPage |
| 作品详情：简介/评分/制作公司、AniList HTTPS 官方播放与官网链接、本地媒体库入口 | AnimeDetailPage |

**已验证基线（2026-07-22）**：

- jimaku 用真实 key 联调通过：《葬送のフリーレン》第 1 话字幕真实下载并解析出 265 句；测试媒体已清理，系列映射保留。
- 生词本在浏览器中完成“收藏单词 + 收藏句子 → 列表展示 → TSV 导出”链路；演示数据已清理。
- JMdict Simplified 英文版 `3.6.2+20260720135044` 已导入：读取 217,974 个词条，SQLite 展开为 273,435 行；
  导入脚本已适配 `stream-json 3.5.0` 的 ESM 路径，并有微型 JSON 回归测试。
- 动画发现用真实 AniList 数据完成浏览器链路：2026 年 7 月/4 月切换 → 搜索 `Frieren` →
  打开《葬送のフリーレン》详情 → 显示 Crunchyroll/Netflix/YouTube 等官方入口 → 进入本地媒体库；
  320px 宽度下页面宽度等于视口，无横向溢出，浏览器控制台无 warning/error。
- 自动测试基线为 server 64 个、web 12 个；TypeScript 与 web production build 通过。
  后续以实际 `npm test` 输出为准，不要只依赖这个数字。

## 4. 关键决策记录（为什么这么做）

- **本地 Web 应用而非 Electron/mpv 插件**：开发快、UI 灵活、用户可远程访问；用户确认过。
- **mkv 处理用 remux 而非转码**：h264+mkv 只换封装秒级完成；音轨统一转 AAC；字幕轨丢弃（单独抽成文件走统一管线）。
- **AI 引擎分层**：本地分词零成本秒出（每次暂停都跑），Claude API 只在按 D 时调用且缓存——成本可控。
- **Anki 用 TSV 导出而非 AnkiConnect**：不依赖 Anki 在跑/装插件；以后要一键推送再加。
- **jimaku 半自动**：番名模糊匹配不可靠，首次人工选一次 + jimaku_mapping 记住，之后全自动。
- **季番目录走服务端 AniList 适配层**：浏览器不直连 GraphQL；服务端统一非成人过滤、字段清理、
  HTTPS 资源筛选、错误映射和 10 分钟缓存。每页最多 20 条，不批量镜像 AniList 数据。
- **发现与本地学习分层**：`/` 用来找作品，`/library` 保留已验证的本地学习管线；
  AniList 故障只影响发现页，不应阻断播放器、生词本或本地扫描。
- **外部资源只给官方入口**：首版不聚合盗版播放、磁力或不明下载文件；详情仅显示 AniList
  标记的 HTTPS `STREAMING`/`INFO`。应用内下载需要另行确认合法数据源和生命周期。
- **better-sqlite3 锁 v11**：v13 prebuilt 在这台 Mac(arm64, Node 22.12) `new Database()` 直接 segfault。**不要升级**。
- **npm 安装**：用户 ~/.npmrc 走 Clash 代理(127.0.0.1:7890)，代理没开时一切 install 失败；
  用 `npm install --userconfig /dev/null --registry https://registry.npmjs.org ...` 绕过，别改全局配置。

## 5. 已知小问题 / 待打磨

- jimaku_mapping.entry_name 存的是 ID 字符串而非作品名（仅备注字段，不影响功能，顺手可修）
- 视频自然播完时面板行为、原生控制条 Space 与快捷键 Space 可能双触发（实测未出问题，留意）
- 「続き」需 positionSec>30 才显示；播放页尚无「从头开始/继续」选择
- 转码兜底（H.265 源后台转码）未做，当前只提示换源
- AniList 的作品简介多数是英文，首版不自动翻译；后续需真实使用确认是否值得接入缓存翻译
- 编辑推荐理由按 AniList ID 本地维护；新季度若没有配置，会自动退化为本季人气前三而无定制理由
- 新番目录依赖网络与 AniList 可用性；当前只有 10 分钟进程内缓存，服务重启后不会离线保留

## 6. 下一步路线图

### 6.1 本地下载器与字幕自动衔接（设计待审阅，未实现）

独立设计文档：`docs/superpowers/specs/2026-07-22-local-download-pipeline-design.md`。

**范围决定（2026-07-22，用户确认）：首版做精简版**——只做「详情页搜 nyaa → 点击用本机 qBittorrent
打开 magnet」，下载完复用现有「フォルダをスキャン」按钮 + jimaku 流程；不做下载意图状态机、
MEDIA_DIR 监控、下载状态页、新 SQLite 表。自动衔接留到精简版用过之后按反馈再决定（见设计文档第 7 节）。

用户提供的原始流程截图已确认下载来源为 nyaa.si，目标架构为：Nyaa 只提供搜索元数据和 magnet，
qBittorrent 在用户电脑上打开添加窗口并由用户选择本地目录，视频不经过部署服务器。当前本地 Fastify 服务作为
“本地助手”，在下载完成后扫描 `MEDIA_DIR`，再复用 jimaku 与播放器。

阶段边界：

- 第一阶段：Nyaa RSS 搜索、详情页资源列表、magnet 打开本机 qBittorrent、下载意图、目录完成检测、
  自动扫描和 jimaku 衔接。
- 第二阶段：qBittorrent WebUI 连接、精确进度、info hash 文件关联和完成事件。
- 明确不做：服务器端视频下载、自建 BitTorrent 客户端、跨设备同步视频、远程删除用户文件。

实施前需先完成书面设计审阅，并确认 qBittorrent 安装与 `~/AnimeLibrary` 默认目录设置。

### 6.2 动画发现后续（按真实使用反馈排序）

- “追番”列表：保存想看/在看状态，与本地媒体进度关联，而不是另做一套播放进度
- 作品详情与本地系列的人工一次匹配；之后从详情直接定位已有剧集和 jimaku 映射
- 作品简介本地化；优先按需翻译并缓存，不批量调用 AI
- 下一季度编辑推荐更新；没有本地推荐时继续使用人气前三的可靠降级

### 6.3 backlog（用户提过或预留，未排期）

- 学习模式严格版：暂停不自动显示字幕，再按一键才显示（spec 里留过口子，等使用反馈）
- AnkiConnect 一键推送；生词本内复习（简单间隔重复）
- 多字幕轨支持（一个视频多个 subtitle_file，切换）；字幕样式设置（字号等）
- 转码兜底：ffmpeg 后台转 H.265 → h264
- 播放页「继续/从头」选择；剧集自动连播

## 7. 开发约定

- **TDD**：纯逻辑（解析、状态机、文件挑选、路由）先写 vitest 测试；外部依赖（ffmpeg/jimaku/Claude）
  全部依赖注入 fake。跑法：`npm test`（当前 server 64 + web 12，改完必须全绿）。
- **模块模式**：新功能 = `server/src/modules/<name>/routes.ts`（Fastify plugin，opts 传 db 和可注入依赖）
  + `index.ts` 注册 + `web/src/api.ts` 加方法。别在组件里直接 fetch。
- **UI**：颜色只用 index.css `:root` 变量；日文 UI 文案；学习模式相关逻辑进 learningMode.ts reducer（保持可测）。
- **提交**：不假设 `main`/`master`；用户明确要求提交时，以当前分支为准，一个完整功能一个中文 commit。推送需另行授权。
- **浏览器验证**：改 UI 后用 dev server 实测（.claude/launch.json 已配 server/web 两个配置）。

## 8. 后续设计原则

- **围绕学习闭环，而不是堆功能**：找到合适的番（发现）→ 听不懂 → 定位句子 → 理解 → 收藏 → 复习。
  发现是闭环的第一步（挑到难度合适、值得沉浸的作品），不是并列的第二产品；后续发现功能应朝
  “按水平/对话密度推荐”这个方向靠拢，而非做成通用番剧数据库。其他新功能同样必须说明它减少了哪一步的摩擦。
- **统一导入管线**：无论文件来自手动复制、字幕服务还是未来下载模块，都落入 `MEDIA_DIR`，复用 scanner、`subtitle_file` 和现有解析器。
- **本地优先，AI 按需**：分词与词典保持本地、快速、零调用成本；生成式讲解由用户明确触发并缓存。
- **不可靠匹配保留一次人工确认**：jimaku 已采用“首次选作品、后续记忆映射”；其他外部数据源也优先遵循这个模式。
- **核心交互保持纯状态机**：播放、暂停、跳句、选择字幕句等行为先在 reducer 中定义和测试，再接 UI。
- **可移植输出优先**：当前用 Anki TSV 而非强绑定插件；只有真实使用证明一键推送有价值时再引入 AnkiConnect。
- **逐层自动化**：先让人工流程可靠，再自动匹配和串联；外部服务失败不能破坏本地播放与学习模式。
- **发现数据少取、短缓存、不囤积**：AniList 每页最多 20 条并缓存 10 分钟；仅保存本地编辑理由，
  不把外部目录当作可永久镜像的项目资产。
- **资源入口先安全可解释**：官方 streaming/info 链接可直接展示；任何下载器必须在设计中明确来源、
  用户触发点、文件落点和完整生命周期，不以“搜索方便”为由扩大授权范围。

## 9. 新会话接手与完成清单

开始任务：

1. 阅读 `AGENTS.md`、本文件和 `README.md`。
2. 检查 `git status --short`、近期提交和相关测试，确认用户改动与当前基线。
3. 用一句话定义本次成功标准；遇到会改变产品范围的歧义时先询问。

完成任务：

1. 运行与改动成比例的测试；常规完整验证为 `npm test`。
2. UI 改动在浏览器实测关键链路，记录实际结果。
3. 更新本文件中受影响的现状、决策、已知问题或路线图；用户操作变化再更新 `README.md`。
4. 明确报告尚未完成、未验证或依赖外部条件的事项，不把草案写成已完成功能。
