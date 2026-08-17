# 开发与产品交接文档

> 这是 Codex 与 Claude 共用的项目状态、关键决策和未来设计的唯一事实源。每次功能迭代后更新。
> 新会话接手工作前还应先读仓库根目录 `AGENTS.md`。历史设计过程见
> `docs/superpowers/specs/2026-07-21-jp-learning-player-design.md`（MVP 设计）与
> `docs/superpowers/plans/2026-07-21-jp-learning-player-mvp.md`（MVP 实现计划，已全部完成）。
> 动画发现功能见 `docs/superpowers/specs/2026-07-22-anime-discovery-design.md` 与对应 plan。
> アニメ/ドラマ 双模式见 `docs/superpowers/specs/2026-08-14-drama-mode-design.md` 与对应 plan
> （注意：该 spec 的 CSS 工作量估算与降级分支在实施中被修正，以本文件 §4 为准）。
> 双击启动器与一行安装脚本见 `docs/superpowers/specs/2026-08-17-launcher-and-install-script-design.md` 与对应 plan
> （实施时把 Node 22 的来源从 fnm 改为直接下载 nodejs.org 官方包，理由见 §4）。
>
> 最后校对：2026-08-17。

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

内容分**アニメ**与**ドラマ（日剧）**两个模式，顶部导航切换，整站视觉随之在墨黑与米白之间反转。
日剧只覆盖日语作品：现代口语、职场与日常场景，比动画更贴近真实工作日语——这是把它纳入的唯一理由，
不做通用影视数据库。两个模式共用同一条学习管线（扫描 / remux / 播放器 / 分词 / 词典 / AI 讲解 / 生词本），
差异只在目录来源（AniList 实时 vs 随包手写清单 + Bangumi 关键词检索）、Nyaa 分类和 jimaku 检索范围。

## 2. 架构总览

本地双进程：`npm start` 同时起 server(3001) 与 web(5173，/api 代理到 3001)。

```
server/src/
  index.ts               Fastify 启动 + 全部路由注册
  config.ts              端口 / 媒体目录默认值与 MEDIA_DIR 优先级 / DATA_DIR(server/data)
  db.ts                  better-sqlite3 打开 + 全部建表（IF NOT EXISTS，改表结构直接加在这里）
  modules/
    media/     filename.ts(文件名→series/episode) ffmpeg.ts(probe/remux命令,纯函数+执行分离)
               scanner.ts(指定文件/整目录扫描,返回新增ID) watcher.ts(稳定性检测+目录监听+周期对账)
               routes.ts(列表/手动scan/Range流)
    subtitle/  parser.ts(srt+ass→Cue{start,end,text}) routes.ts(句子列表+偏移)
    analyze/   tokenizer.ts(kuromoji惰性单例) dictionary.ts(JMdict查词) romaji.ts(かな→ヘボン式,検索語生成)
               jmdict-import.ts(流式导入) routes.ts(/api/analyze)
    ai/        explain.ts(Anthropic / DeepSeek / OpenAI / Gemini API, structured outputs) routes.ts(/api/explain, SQLite缓存)
    jimaku/    client.ts(jimaku.cc API + pickBestFile) service.ts(可复用字幕下载)
               sync.ts(持久状态+去重串行自动取得) routes.ts(candidates/download)
    catalog/   client.ts(AniList GraphQL + normalize + 10分钟缓存)
               editorial.ts(本地学习向推荐理由) routes.ts(/api/catalog/*)
    drama/     editorial.ts(手写日剧清单=首页唯一内容,含 CatalogDrama 类型) bangumi.ts(Bangumi 检索/详情客户端,免 key,10分钟缓存)
               routes.ts(/api/drama/*: 精选 /:id、Bangumi /search 与 /bgm/:id、Nyaa 直搜 /search/resources)
    resource/  provider.ts(统一资源类型 + ContentKind + Nyaa分类表) nyaa.ts(RSS解析/排序/5分钟缓存)
               routes.ts(/api/catalog/anime/:id/resources)
    vocab/     anki.ts(AnkiConnect客户端+卡片格式/去重) routes.ts(收藏 CRUD + 一键导出)
    misc/      routes.ts(progress + settings)
web/src/
  api.ts                 唯一的后端调用出口（所有 fetch 都在这）
  mode.ts                アニメ/ドラマ 模式纯逻辑（存储值归一化 + 有效模式推导）
  pages/                 DiscoverPage / DramaDiscoverPage / AnimeDetailPage / DramaDetailPage
                         LibraryPage / PlayerPage / VocabPage / SettingsPage
  catalog/               view.ts（季度/状态/评分）resourceView.ts（资源显示纯函数）
                         ResourceResults.tsx（Nyaa 候选与 magnet 交接，取数可注入）
  drama/                 view.ts（放送年 / Bangumi 评分 / 卡片副行 / 详情路径 纯函数）
  player/                learningMode.ts(纯reducer,核心状态机) AnalysisPanel / TranscriptList / SubtitleOverlay

scripts/                 纯 Node（无第三方依赖）与安装脚本
  start.mjs              `npm start`：预检 → spawn server/web；`TANKU_OPEN_BROWSER=1` 时就绪后开浏览器
  precheck.mjs           Node 22 硬检查 / FFmpeg 分级警告（纯函数 + 注入 exec，server 有单测）
  browser.mjs            web URL / 各平台打开命令 / HTTP 就绪轮询（纯函数 + 注入 fetch，server 有单测）
  verify-start.mjs       临时端口 + 临时数据目录真实起一次并检查 health（CI 用）
  install.sh / .ps1      一行安装：tarball + 官方 Node 22 + FFmpeg → `<安装目录>/.tools/`，见 §4
tanku Anime.command/.bat 根目录双击启动器：前置 `.tools/`，检查 Node 22，`TANKU_OPEN_BROWSER=1 npm start`
```

SQLite 表：`media, subtitle_file, progress, explain_cache, settings, dict, jimaku_mapping, subtitle_sync_state, vocab`
（settings 存 `ai_provider` / `anthropic_api_key` / `deepseek_api_key` / `openai_api_key` / `gemini_api_key` /
`jimaku_api_key` / `ai_model` / `explain_language`(auto|zh|en) / `media_dir`，凭证值不得进入日志、测试或文档）。
settings 是通用 KV 表，新增凭证项不需要数据库迁移。

## 3. 已完成功能

| 功能 | 关键位置 |
|------|----------|
| 媒体扫描：mkv 自动 remux 成 .play.mp4、抽内嵌字幕、外部 `.ja.srt` 优先；扫描时先对已有条目重新解析文件名（`reparseExistingMedia`），解析器升级后旧数据点一次扫描即自动修正 | media/scanner.ts |
| 文件名解析：支持 `SxxExx`、点分隔 scene 命名（`A.B.S02E01.1080p...-GROUP`）、`- NN`、`第NN話`；剥掉年份/版本 v2/发布组/画质/编码尾巴，得到干净作品名+集数，供 jimaku 按标题+集数匹配 | media/filename.ts |
| H.265/HEVC Main 10 只在已验证的 macOS 浏览器路径 remux；Windows/Linux 保守标记「要トランスコード」，H.264 10-bit 等不兼容源同样不放行 | media/ffmpeg.ts decidePlayability |
| 学习模式：首次默认无字幕；Space 暂停+显示；A 回句首（快速连按回上一句）；←/→ 跳句；S 常显且开关在浏览器本地保持；[ ] 偏移±100ms；右侧解析独立保持已选句，重听时不消失；页面快捷键提示可直接点击 | player/learningMode.ts + PlayerPage |
| 桌面播放器布局：视频/解析面板之间可拖动调宽并记住宽度；自定义全屏会将视频、状态和字幕层一起全屏 | PlayerPage + playerLayout.ts |
| 播放控制条：不用原生 controls（各浏览器行为不一、会自动隐藏且此环境不渲染），改自绘常显进度条+当前/总时长+播放暂停+可拖动 seek；全屏按钮与进度条默认隐藏，hover 到画面或暂停时才出现；去掉了会挡画面的模式徽章 | PlayerPage + playerControls.ts |
| 播放器同目录选集：列出当前物理目录中的可播放视频，提供上一话、下一话与直接选集；切集时重置字幕、学习句和讲解状态 | PlayerPage + episodeNavigation.ts |
| 右侧面板双 Tab：解析（分词chip+词卡+AI讲解）/ 字幕一覧（T 键，打开即定位当前句，点句=SELECT跳转+暂停+解析） | AnalysisPanel / TranscriptList |
| 本地分析：kuromoji 分词+变形还原，JMdict 查词（需手动导入，见 README） | analyze/* |
| AI 深度讲解：D 键，设置页可选 Anthropic、DeepSeek、OpenAI（Codex / GPT）或 Google Gemini；统一输出{翻译/语法结构/表现/语气}，只给原句中出现的日语汉字标读音，解释新增术语不标；讲解语言中/英二选一，默认按浏览器 `Accept-Language`（→ 服务器 OS locale → en）自动判定，设置页可固定；按格式版本/服务/模型/语言/句子缓存 | ai/explain.ts + ai/language.ts |
| jimaku 字幕匹配：每系列候选选一次→存 jimaku_mapping→**同系列其余集自动下载**（选完立即 reconcile，2.5s 间隔防限流，.srt 优先跳过压缩包）；启动/扫描/watcher 也会补下有映射的缺字幕集 | jimaku/* + sync.ts |
| 生词本：词/句收藏（带出处+时间戳，去重），详情页显示本地释义、既有 AI 缓存和精准播放链接；一键创建/更新 Anki 的 `tanku Anime` 牌组 | vocab/anki.ts + routes.ts + VocabPage + VocabDetailPage |
| 观看进度：5 秒一存，暂停/离页补存；重新进入自动恢复，带 `?t=` 的生词链接一次性优先 | misc/routes.ts + playbackPosition.ts + PlayerPage |
| 动画发现：首页实时显示当前季/上季、学习向 3 部推荐、日/英/罗马字搜索、响应式卡片 | catalog/* + DiscoverPage |
| 作品详情：简介/评分/制作公司、AniList HTTPS 官方播放与官网链接、本地媒体库入口 | AnimeDetailPage |
| 本机下载交接：按季度过滤错季结果，整季/可直接播放/1080p/可信/多字幕智能排序，再用合法 magnet 交给本机下载器 | resource/* + ResourceResults |
| 本地媒体自动衔接：设置页可保存媒体目录，监听稳定文件后自动扫描；媒体库按相对目录分组且每组可独立折叠；已有 Jimaku 映射自动取字幕，无映射/失败时非打断提示 | misc/routes.ts + media/watcher.ts + jimaku/sync.ts + LibraryPage |
| 开源首用与故障反馈：空媒体库三步引导；设置页区分必需媒体与可选扩展；媒体库/设置/单词本/解析有统一加载、错误、重试，单词删除支持一次撤销；未知路由显示 404 | LibraryPage + SettingsPage + VocabPage + AnalysisPanel + NotFoundPage |
| 视觉系统改版：墨黑+米白单色系统，全部颜色/字体/圆角收敛为 index.css `:root` token；标识推导的四构件（方块 10px 圆角 / 选中态底边缺口 / 双横眼 / 短横指示器）贯穿导航、选集、解析面板；播放器字幕使用透明底高对比文字，避免遮挡画面 | index.css + components/BrandMark + App + 各页面 |
| 开源安装降摩擦：`npm start` 启动预检（Node 22 硬检查、FFmpeg 分级警告、`TANKU_SKIP_PRECHECK=1` 跳过）；`npm run setup:jmdict` 一键下载/解压/导入词典，失败时给手动兜底指引 | scripts/precheck.mjs + scripts/start.mjs + analyze/jmdict-download.ts + server/scripts/setup-jmdict.ts |
| 双击启动器 + 一行命令安装：根目录 `tanku Anime.command` / `tanku Anime.bat` 双击即 `npm start` 并在页面就绪后自动开浏览器（`TANKU_OPEN_BROWSER=1`）；`scripts/install.sh` / `install.ps1` 一条 curl/irm 命令把源码 tarball、官方 Node 22、FFmpeg 全装进 `~/tankuanime/.tools/`（无 sudo、不改系统 PATH/shell 配置），再 `npm ci` + 词典 + 桌面快捷方式 + 启动一次；重跑即更新 | tanku Anime.command/.bat + scripts/browser.mjs + scripts/start.mjs + scripts/install.sh/.ps1 + ci.yml install-smoke |
| アニメ/ドラマ 双模式：顶部导航切换，整站在墨黑（アニメ）与米白（ドラマ）两套主题间反转；标识形状不变只反转配色；播放页在两模式下都保持墨黑 | web/src/mode.ts + App.tsx + index.css `[data-mode]` + BrandMark |
| 日剧发现：按听力难度分级的随包清单 15 部 + 昼顔横幅，零配置可用；顶部搜索框查 Bangumi（免 key，只留 `platform=日剧`），结果为海报/评分/话数/电视台的作品卡片，同名精选自动并入难度与推荐理由；卡片下方「もっと探す（Nyaa で直接検索）」展开关键词直搜 Nyaa（0 命中或 Bangumi 不可用时自动展开），日文输入 0 命中时自动改用罗马字读音重查 | drama/bangumi.ts + drama/routes.ts + analyze/romaji.ts + DramaDiscoverPage |
| 日剧详情与资源：`/drama/:id`（精选）与 `/drama/bgm/:id`（Bangumi，含日文简介/评分/放送局）共用一页；Nyaa Live Action 分类（默认全部）复用既有排序与 magnet 管线，Bangumi 条目用原题 + 拉丁别名（无别名则罗马字读音）检索；jimaku 候选同时查动画与真人剧库并合并去重 | DramaDetailPage + resource/provider.ts + drama/routes.ts + jimaku/client.ts |

**已验证基线（截至 2026-08-08）**：

- jimaku 用真实 key 联调通过：《葬送のフリーレン》第 1 话字幕真实下载并解析出 265 句；测试媒体已清理，系列映射保留。
- 生词本在浏览器中完成“收藏单词 + 收藏句子 → 列表展示 → 详情与时间链接”链路；一键 Anki 按钮已用临时
  AnkiConnect 模拟器验证成功/不可用提示，控制台无错误，临时生词和数据库已清理。真实 AnkiConnect 6
  联调已创建 `tanku Anime` 牌组和同名卡片类型，将 3 条现有收藏写入带时间的来源链接；第二次导出新增 0、
  跳过 3，确认去重有效。
- JMdict Simplified 英文版 `3.6.2+20260720135044` 已导入：读取 217,974 个词条，SQLite 展开为 273,435 行；
  导入脚本已适配 `stream-json 3.5.0` 的 ESM 路径，并有微型 JSON 回归测试。
- 动画发现用真实 AniList 数据完成浏览器链路：2026 年 7 月/4 月切换 → 搜索 `Frieren` →
  打开《葬送のフリーレン》详情 → 显示 Crunchyroll/Netflix/YouTube 等官方入口 → 进入本地媒体库；
  320px 宽度下页面宽度等于视口，无横向溢出，浏览器控制台无 warning/error。
- 本机下载交接用 AniList 作品 196187 实测：Nyaa 英语字幕分类返回真实候选，页面显示可信标记、
  画质/编码/大小/做种数/日期；Raw 分类切换和 magnet href 正确。H.265 已于 2026-07-31
  在当前 Mac 浏览器验证为 remux 后可直接播放，AV1 与 H.264 10-bit 等未验证源继续显示转换提醒。
  Transmission 4.1.3 已设为 magnet 默认应用，默认保存目录为 `/Users/daniel/AnimeLibrary`，
  保留“打开 magnet 时显示确认窗口”；验证没有实际添加受版权保护的下载任务。
- Transmission 的 macOS URL 处理器实测不接受把 `xt=urn:btih:<hash>` 整体表单编码成
  `xt=urn%3Abtih%3A<hash>`；现已保留原始 `urn:btih:`，只对 `dn` 标题编码。浏览器真实列表第一个
  href 已验证为新格式，没有实际点击或添加下载任务。
- 自动衔接在真实开发服务启动后发现并导入既有 `Test Anime - 01.mkv`，识别同名外部字幕；浏览器中用临时
  SQLite 行验证 `needs_mapping/downloading/failed/ready` 四种状态，页面无需刷新即轮询更新，顶部只统计
  1 个待选择条目，失败原因/重试按钮正确，控制台无 warning/error；临时行已全部清理。
- Nyaa 季度过滤用 AniList 108465《无职転生》第一季真实验证：查询词收窄为带 `S01` 的标题，返回 20 个
  第一季候选，`S02/S03`、`II/III` 和 `Ⅱ/Ⅲ` 错季结果为 0；`S03E05` 紧连集数格式已有回归测试。
- 同一真实列表验证智能排序：2160p 52.7 GiB 与 1080p 80.2 GiB 的超大候选被降级，第一项为
  1080p HEVC Main 10、16.9 GiB 的完整第一季 + OVA 包；该包已真实下载并验证只需 remux。
- 2026-07-31《无职転生》第一季真实闭环：Transmission 下载约 17 GiB、24 个 MKV（01–23 + 17.5）
  到发布者子目录；递归扫描全部识别，HEVC Main 10 视频流原样复制、日语 Opus 转 AAC，生成 24 个
  可播放 MP4。Jimaku 按前半 1426、后半 3547、特典 3546 分段取得 24 份日语 SRT，每集解析
  228–462 句。第 1/12/23 集真实播放页均为 1920×1080、`readyState=4`、无媒体错误；点字幕句可跳转、
  暂停、显示并分词。
- 自动测试基线为 server 154 个、web 37 个；server/web TypeScript noEmit 与 web production build 通过。
  后续以实际 `npm test` 输出为准，不要只依赖这个数字。
- 2026-08-01：播放器实际验证 DeepSeek `deepseek-v4-flash` 能生成四段式日语解说；同一字幕中的
  `こもる` 词典释义因异体字导致的重复已按释义去重，界面只显示一次。
- ~~2026-08-01：AI 解说中每次出现的日语汉字都附读音。~~ **已过时（2026-08-02）**：这会让
  `名詞`、`仮定形`、`推量` 等解释术语充满括号，降低可读性。
- 2026-08-02：读音规则收窄为“只给原句中出现的日语汉字标注假名”；解释为了说明而新增的文法术语、
  品词名及中文汉字不标读音。解释缓存格式由 `furigana-v2` 升到 `source-furigana-v3`，旧结果会自动重新生成。
- 2026-08-01：设置页与服务端新增 OpenAI（Codex / GPT）提供商，默认 `gpt-5.6-sol`，通过 Responses API
  的 `text.format` JSON Schema 输出；浏览器已验证选项、默认模型和 key 状态文案，真实 key 的首次讲解联调待配置后验证。
- 2026-08-01：新增 Google Gemini 提供商，默认稳定模型 `gemini-3.6-flash`，按官方 Interactions API
  调用，`store: false`，以 `response_format` JSON Schema 输出。真实 Google AI Studio key 已完成接口和播放器
  D 键实弹联调，能够生成四段式解说。联调修复了两个兼容点：读取最后一个 `model_output` 的全部
  `text` 分块并拼接；使用 `thinking_level: low`、`max_output_tokens: 4096`，避免思考预算挤占结构化输出
  而产生截断 JSON。浏览器验证解说正常显示且无控制台错误，相同服务/模型/句子会命中缓存。
- 2026-08-01：桌面播放页由固定两栏改为可调分栏；分隔线支持拖动和左右方向键，宽度存于浏览器本地。
  视频原生全屏入口隐藏，改由视频容器调用 Fullscreen API，使 `SubtitleOverlay` 与视频一起进入全屏。
  真实浏览器验证 62%→64% 调整与跨页面重开保留；全屏容器为 1800×1126，字幕层宽 1800 且可见，
  退出全屏正常、错误日志为空。820px 以下继续使用上下布局。
- 2026-08-03：播放器快捷键提示已改为可点击按钮；实测 Space 点击会暂停并显示字幕，连续点击 A 会从当前句
  回到上一句。打开字幕一覧时，当前第 14 条直接位于列表中部（`scrollTop=218.5`），浏览器控制台无错误。
- 2026-08-06：暂停选中一句后点击 A 重听，播放器恢复播放且字幕维持原有显示规则；右侧解析仍保留该句、分词与操作按钮。
  暂停到另一句时，解析才切换到新句。
- 2026-08-07：完成 Windows 兼容审计与最小修复。根 `npm start` 不再使用 POSIX 的 `& wait`，改由 Node
  直接启动 tsx/Vite CLI；新增 `npm run verify:start`，用临时数据目录和随机本地端口实际检查 server、web、
  `/api/health`、SQLite 与目录 watcher。CI 矩阵加入 `windows-latest`。本机 macOS 启动烟测已通过；Windows CI
  首次结果需在本批改动推送后确认，Windows 实机媒体播放仍未宣称完成。
- 2026-08-08：在一台新的 Windows 远程主机上仅给出 README 中的一句安装指令完成首次安装。WinGet 的移动
  `OpenJS.NodeJS.LTS` 别名当时解析为 Node 24，导致锁定的 `better-sqlite3` 回退到本地 C++ 编译；改用 fnm
  安装并启用 Node 22.23.2 后，`npm ci` 正常完成。FFmpeg 9.0、后端健康接口和 Vite 页面均验证通过，过程中
  未播放媒体或声音。该次克隆的 GitHub 默认分支仍是旧版，根启动脚本含 POSIX 语法，因此临时用两个本机
  PowerShell 进程启动。改动推送到默认分支后，又在全新目录只发送同一句安装指令复测：agent 自行读取仓库
  文档，使用 Node 22.23.2、npm 10.9.8 与 FFmpeg/ffprobe 9.0 完成 `npm ci`、全部测试和 web build，并只用仓库
  自带的单一 `npm start` 在默认 3001/5173 启动。后端及前端代理健康接口都返回 `{"ok":true}`，运行进程已确认
  来自新克隆目录；全程未打开或播放媒体。
- 2026-08-08：设置页显示实际媒体目录与默认目录，可保存新的绝对路径并在下次启动时生效；`MEDIA_DIR`
  环境变量仍保持最高优先级且会锁定页面输入。设置动作只写配置，不创建、移动或删除媒体。媒体列表接口只返回
  相对于媒体根目录的文件夹标签，前端按标签分组且每组可独立折叠，不暴露完整本地文件路径。折叠状态在媒体库
  的自动刷新期间保持，离开页面后不持久化。
- 2026-08-08：生词可进入详情页查看保存释义、来源句和已有 AI 缓存；来源链接携带句子时间。播放器重新进入时
  读取 SQLite 观看进度，时间链接只在首次进入时覆盖进度；暂停和离页会补存当前位置。视频获得焦点时 Space
  由视频元素在捕获阶段提前拦截并阻止冒泡，避免原生控制与全局快捷键各执行一次造成“暂停后立即继续”。
- 2026-08-08：播放器把常用与次要控制分层，字幕偏移保留为 `[` / `]` 键盘专用；同目录 24 集真实浏览器验证
  可横向选集，上一/下一话切换后 URL、视频源、当前集计数同步更新。空数据库实例验证首用三步引导和设置页
  “本地播放不需要 API key”说明；未知路由显示带返回入口的 404。加载、失败、重试与单词删除撤销采用统一反馈。
- 2026-08-08：CORS 从反射任意 Origin 改为本地 Web 来源的精确 allowlist，可用 `CORS_ORIGINS` 扩展；Anki
  播放回链修正为真实 `/play/:id`，并可由 `APP_BASE_URL` 覆盖。生产及开发依赖审计均为 0 个漏洞。
- 2026-08-08：按 Claude Design 稿《tanku Anime 视觉改版》完成全站视觉换肤（纯视觉层，reducer/API/路由未动）。
  真实浏览器验证：发现页导航胶囊选中态带缺口、hero 用 AniList 真图 + 墨色渐变、编辑推荐三卡为米白/温白/墨三种
  表面（前两张带底边缺口）、季度网格 20 部真实作品带评分徽章与双横眼装饰、marquee 动画运转；播放页对
  Mushoku Tensei 第 1 话实测暂停→透明底高对比字幕→解析面板（米白面）显示「現在のセリフ · 1:50」+ 7 个分词
  chip + 双横眼 AI 标签；ライブラリ显示 `LOCAL · 4 FOLDERS · 38 FILES` 统计与短横指示器；単語帳两列布局
  与 `SAVED · N WORDS · N SENTENCES` 统计正常。全程浏览器控制台无 warning/error；server 136 + web 36 测试、
  两端 tsc noEmit 与 web production build 全部通过。验证期间自动播放使该集进度短暂前进，已恢复为原 113 秒。
- 2026-08-08：启动预检与 JMdict 一键安装落地。预检纯逻辑有 8 个单测（版本判定、缺失分级、平台文案、跳过开关）；
  真实验证 `npm run verify:start` 正常通过，PATH 无 ffmpeg 时 `npm start` 打印 macOS 安装提示后仍继续启动。
  `setup:jmdict` 用隔离的 `JMDICT_VENDOR_DIR`/`DATA_DIR` 真网实跑：GitHub API 解析锁定 tag → 下载 10.9 MiB →
  解压 `jmdict-eng-3.6.2.json` → 导入 217,974 词条（与既有导入基线一致）并输出 EDRDG / CC BY-SA 署名；再次运行
  命中「Reusing existing」跳过下载；`--tag bogus-tag` 走 404 错误路径并输出手动兜底指引，退出码非 0。
  Node 版本硬失败分支仅有单元覆盖，尚未用真实的错误版本 Node 实跑。
- 2026-08-15：アニメ/ドラマ 双模式落地。浏览器实测两个模式下逐页扫描（発見 / 詳細 / ライブラリ /
  単語帳 / 設定 / 404），前景与背景对比度低于 3:1 的元素为 **0**，边框不可见项为 0。ドラマ模式下打开
  播放路由，`<html data-mode>` 变为 `anime`、页面与导航底色均为 `#0B0B0A`、解析面板仍是米白亮岛，
  离开后恢复 `drama`；localStorage 中用户选择的模式全程未被播放页改写。验证期间未播放任何媒体
  （video 元素确认 muted 且 paused）。全新标签页控制台无 warning / error。
- 2026-08-15：日剧资源搜索用真实 Nyaa 数据完成闭环。`半沢直樹` 返回 2 条、`アンナチュラル` 11 条
  真实 Live Action - Raw 发布，magnet 全部为合法 `magnet:?xt=urn:btih:` 形式，整季包排序在前。
  `きのう何食べた？` 无 raw 发布，切到「字幕付き」（`c=4_1`）后命中真实英译发布——同时反向验证了
  真人剧子分类映射正确（若误用 `4_2` 会返回偶像 PV）。
- 2026-08-15：**jimaku 真人剧支持已用真实 key 实测确认**（此前只是从 `jimaku.cc/dramas` 页面存在性推断）。
  `半沢直樹` 返回 2 条、`Unnatural` 1 条，均为 `anilist_id` 为空的真人剧条目——改动前 `anime=true`
  会将其全部排除。验证脚本为一次性临时文件，运行后已删除，凭证值未进入任何输出。
- 2026-08-15：自动测试基线为 server 185 个、web 53 个；两端 `tsc --noEmit` 与 web production build 通过。
  （TMDB 依赖已于同日移除，见 §4「日剧检索目录用 Bangumi」。）
- 2026-08-15：首个外部用户反馈「下载区只显示去 nyaa 网站的链接」，定位为服务端 fetch 到不了 nyaa.si
  （国内网络 + Node 不走系统代理），并非配置缺失。已落地：`nyaa.ts` 把 undici 的 `cause.code` 并入错误信息
  （`fetch failed (ENOTFOUND)`）；动画/日剧两条资源路由的 502 增加 `reason` 字段并 `log.warn` 到终端；
  前端 error 卡片改为说明「是服务器而非浏览器要连 nyaa.si」+ mono 字体的 `NODE_USE_ENV_PROXY` 修复提示 +
  上游原因；三语 README 与 `docs/AI-SETUP.md` 加入代理排障小节。用 `--import` 预载脚本在隔离端口
  （3101/5273、临时 DATA_DIR/MEDIA_DIR）把 nyaa.si 伪装成 ENOTFOUND 做了真实浏览器验证：卡片文案、
  提示与 `詳細: fetch failed (ENOTFOUND)` 全部出现，终端有 level 40 警告行，控制台只有预期的 502；
  验证用启动配置与临时目录已清理，真实 3001 服务未受影响。
- 2026-08-16：AI 讲解语言支持中文 / 英文（不做日文——学日语的人不需要日文讲解）。此前 system prompt
  和 JSON Schema 描述硬编码「中国語話者向け、解説は中国語で」，英文用户拿到的仍是中文。现在
  `ai/explain.ts` 按语言模板化 prompt/schema（读音规则两种语言共用），新增 `ai/language.ts` 纯函数：
  设置 `explain_language`（zh/en）优先，未设或 `auto` 时按请求 `Accept-Language` 判定——取偏好列表里
  **第一个 zh 或 en**（`ja,zh-CN` 判成 zh，照顾日文 OS 的中文用户），都没有再看服务器 OS locale，最后
  兜底 en。`/api/settings` 返回 `explain_language` + `explain_language_detected`，设置页新增「AI 解説の言語：
  自動（システム言語: …）/ 中文 / English」。缓存 key 加入语言并把格式版本升到 `explain-lang-v4`，
  旧 `source-furigana-v3` 结果会重新生成（生词本里已存的讲解不受影响）。测试：language 纯函数 10 个、
  路由按 Accept-Language 分缓存 / 设置覆盖各 1 个、settings 三个；浏览器实测设置页下拉保存并刷新后保留。
- 2026-08-16：**ドラマ搜索改为 Bangumi 作品卡片**（用户反馈：直接跳下载列表不如アニメ侧有图有简介）。
  用真实 `api.bgm.tv`（无凭证）实测：`白い` → 8 部日剧卡片（白い春 7.7 / 白い巨塔 2003 9.3 / 白い刑事 評価なし…），
  1966 电影版《白い巨塔》与 `呪怨` 电影被 `platform` 过滤或标为 1 話；`半沢直樹` 命中 2013 / 2020 两条并自动并入
  精选的 `N2 · 硬い敬語` 与 `Hanzawa Naoki`。海报 `lain.bgm.tv` 直连 200。浏览器实测：卡片网格 → 点「白い巨塔」
  `/drama/bgm/2600` 显示 評価 9.3 / 21 話 / フジテレビ / 作品紹介（该条简介为中文，Bangumi 数据如此）→
  资源区可搜；返回后点「もっと探す」展开 Nyaa 直搜得 20 条；`zzqqxxyy` 0 命中 → 空文案 + 直搜自动展开。
  精选详情 `/drama/68786` 不变。控制台无 error，全程未播放媒体。自动测试基线为 server 246 个、web 56 个；
  两端 `tsc --noEmit` 与 web production build 通过。
- 2026-08-17：**双击启动器与一行安装脚本落地**（设计见 `docs/superpowers/specs/2026-08-17-launcher-and-install-script-design.md`）。
  `scripts/browser.mjs` 三个纯函数 9 个单测；`npm run verify:start` 未受影响。启动器用 `open` 走真实 Finder
  路径实测：Finder 起的 Terminal 继承登录 shell 的 PATH（含 Homebrew），临时端口 3101/5273 + 临时 DATA_DIR
  起服务后 Chrome 自动连上 5273，`/api/health` 200。`install.sh` 在隔离 HOME、`PATH=/usr/bin:/bin:/usr/sbin:/sbin`
  （无 node/ffmpeg/brew）下真网实跑：master tarball → nodejs.org `node-v22.23.2-darwin-arm64` SHA-256 校验通过 →
  evermeet `ffmpeg/ffprobe 9.0.1-tessus` 静态包在 Apple Silicon 经 Rosetta 可运行 → `npm ci` 170 包 9 秒（better-sqlite3
  预编译命中）→ JMdict 217,974 词条 → 桌面符号链接；第二次运行 0.8 秒全部跳过；git 检出目录走 `git pull --ff-only` 分支
  且 `TANKU_SKIP_JMDICT=1` 生效。把本地启动器复制进安装目录后用裸 PATH 直接执行：`.tools/node`（v22.23.2）
  与 `.tools/ffmpeg` 被正确前置，预检无 FFmpeg 警告，浏览器自动打开。**Windows 侧本机无实机**：`install.ps1` /
  `.bat` 未在本地执行过，正确性依赖新增的 CI `install-smoke` job（windows-latest 上用 Windows PowerShell 5.1
  以 `Get-Content -Raw | iex` 方式运行、PATH 中剔除 node/ffmpeg 强制走下载分支、随后用安装目录的 Node 跑
  `verify:start`）；`.bat` 的双击行为与 `.lnk` 只能等真实 Windows 用户确认。全程未播放媒体。
  推送后 CI 结果：首轮 windows-latest 失败于 Node 探测——Windows PowerShell 5.1 会吞掉传给原生命令参数里的
  内层引号，`node -p "…split(".")[0]"` 变成语法错误；改为解析 `node -v`（`.bat` 同步改）后第二轮
  macos-latest / windows-latest 全绿：Windows 上 tarball → `node-v22.23.2-win-x64` 校验解压 → gyan essentials
  取出两个 exe → `npm ci` 169 包 7 秒 → `.lnk` 创建成功 → 用 `.tools\node` 跑 `verify:start` 通过。
  **教训：`.ps1` 里传给原生命令的参数不要含引号**（`node -v`、`--flag=value` 这类无引号形式最稳）。

## 4. 关键决策记录（为什么这么做）

- **本地 Web 应用而非 Electron/mpv 插件**：开发快、UI 灵活、用户可远程访问；用户确认过。
- **品牌名为 `tanku Anime`**：导航、浏览器标题、README 与协作政策统一使用该展示名。
  **2026-08-11 仓库改名为 `tankuanime`**（原 `animeprogram`）：改名时 0 star / 0 fork，破坏面最小，
  且 GitHub 对旧地址保留 301 跳转，既有 clone 仍可用。三语 README、`SECURITY.md`、`CODE_OF_CONDUCT.md`、
  `docs/AI-SETUP.md` 中的 URL 与 `cd` 目录已同步。**本地目录 `~/study/animeprogram`、根 `package.json`
  的 `name` 与历史设计文档保持原名**——前两者只影响本机与内部标识，改动会打断现有路径与工具配置，
  收益为零；历史文档记录的是当时事实，不追溯修改。
- **启动命令必须跨平台且只有一个**：用户始终运行 `npm start`。根脚本用 Node 直接解析并启动 workspace 中的
  tsx 与 Vite CLI，不经过 Bash、`cmd.exe` 或 `.cmd` shim，因此不依赖 `&`、`wait` 或 shell 引号规则。
- **媒体目录优先级固定**：`MEDIA_DIR` 环境变量 > 设置页保存在 SQLite 的 `media_dir` > 用户主目录中的
  `AnimeLibrary`。设置页修改只在下次启动时生效，避免运行中重建 watcher 与扫描任务；不会自动迁移旧媒体或清理数据库记录。
- **mkv 处理用 remux 而非转码**：H.264 与已在当前 Mac 浏览器验证的 HEVC Main 10 都只换封装；
  视频流原样复制、音轨统一转 AAC，字幕轨单独走统一管线。Windows 的 HEVC 支持取决于系统版本、硬件、
  扩展和浏览器，不能从服务端可靠判断，因此 Windows/Linux 当前一律提示需要转换；H.264 10-bit 也不冒险放行。
- **AI 引擎分层**：本地分词零成本秒出（每次暂停都跑），AI 解说只在按 D 时调用且缓存；当前支持
  Anthropic、DeepSeek、OpenAI 与 Gemini。DeepSeek 按官方 JSON mode 调用，OpenAI 按 Responses API、
  Gemini 按 Interactions API 的严格 JSON Schema 调用；Gemini 请求关闭服务端保存。设置中所谓“Codex key”
  实际为 OpenAI Platform API key，与 ChatGPT / Codex 订阅分开。
- **AnkiConnect 一键推送，不直改 Anki 数据库**：真实使用已确认手动 TSV 导入摩擦过大。固定创建
  `tanku Anime` 牌组和同名专用卡片类型，以内容哈希作为隐藏首字段去重；同词不同例句可以共存，重复点击只跳过
  已有卡片。Anki/插件不可用时只返回提示，不影响本地生词；插件安装与真实牌组写入必须由用户明确确认。
- **远程 Web 优先同源反代，不把 CORS 当认证**：默认只允许本机 Web 开发来源。需要把 Web 放到服务器时，
  推荐同一域名用 `/api` 反代到仍只监听 loopback 的 Fastify；前后端不同源才用 `VITE_API_BASE_URL` 指定 API，
  并显式配置 `CORS_ORIGINS`。
  `APP_BASE_URL` 只负责生成 Anki 回链。这些配置不会补上认证、HTTPS 或多用户隔离，公开 API 仍不受支持。
- **jimaku 半自动**：番名模糊匹配不可靠，首次人工选一次 + jimaku_mapping 记住，之后全自动。
- **季番目录走服务端 AniList 适配层**：浏览器不直连 GraphQL；服务端统一非成人过滤、字段清理、
  HTTPS 资源筛选、错误映射和 10 分钟缓存。每页最多 20 条，不批量镜像 AniList 数据。
- **发现与本地学习分层**：`/` 用来找作品，`/library` 保留已验证的本地学习管线；
  AniList 故障只影响发现页，不应阻断播放器、生词本或本地扫描。
- **官方观看入口与本机资源搜索分区**：AniList `STREAMING`/`INFO` 继续作为官方入口；用户明确触发时，
  本地 Fastify 才查询 Nyaa RSS 公共元数据。服务端校验 info hash 后构造 `magnet:`，不下载、不缓存、
  不代理视频；最终由本机下载器确认保存位置。Nyaa 故障不影响官方详情与本地学习。
- **下载器用通用 magnet 协议，不绑定 WebUI**：macOS 当前配置 Transmission，保存目录与 `MEDIA_DIR`
  同为 `~/AnimeLibrary`。曾尝试 qBittorrent 5.2.3，但其 Homebrew cask 已因 Gatekeeper 校验问题被弃用，
  本机签名验证也不受信任，因此不绕过系统安全检查；未来若签名恢复仍可直接作为 magnet 处理器。构造链接时
  `xt=urn:btih:<hash>` 必须保持原始协议格式，只编码 `dn`，以兼容 Transmission 的 macOS URL 处理器。
- **自动衔接仍不绑定下载器**：`fs.watch` 只作唤醒，30 秒周期对账兜底；文件大小与 mtime 连续 15 秒
  不变后才扫描；watcher 在 Windows 等平台报错时关闭事件监听，但保留周期对账。scanner 探测失败不入库，之后可重试。Jimaku 只在已有人工映射时自动串行请求；没有映射
  不猜测、不弹窗，失败保留映射和脱敏原因。手动扫描继续作为恢复入口。
- **Nyaa 候选先按季度收窄再排序**：从 AniList 日文/罗马字/英文标题中的 `II/III`、`S02/S03`、
  `Season 2/3`、`第2期/第3期` 推断季度，无标记视为第一季；先用 `S01/S02` 查询，解析完整 RSS 后过滤
  错季，再按整季包、无需转换、H.264/AVC、1080p、合理体积、非 remake、可信标记、多字幕、做种数的
  顺序取前 20 条。H.264 10-bit 同样视为需转换，避免只看编码名称误判浏览器兼容性。
- **better-sqlite3 锁 v11**：v13 prebuilt 在这台 Mac(arm64, Node 22.12) `new Database()` 直接 segfault。**不要升级**。
  v11.10.0 官方 release 同时提供 Node ABI 127（Node 22）的 Windows x64 与 arm64 prebuild；Windows CI 启动烟测
  会实际创建 SQLite。若用户机器仍回退到本地编译，先报告错误，不自动安装 Visual Studio Build Tools。
  **2026-08-15 起 Dependabot 已配置忽略该包的大版本升级**（`.github/dependabot.yml` 的 npm 块，
  `update-types: version-update:semver-major`）。原因是它每周都会开一个升到 v13 的 PR，而合进去
  应用开机即崩、且崩在原生模块段错误这种难排查的位置。11.x 内的补丁仍会正常提示。
  解除条件：迁移到 `node:sqlite`，或在实机确认 v13 以上能正常启动。
- **npm 安装**：用户 ~/.npmrc 走 Clash 代理(127.0.0.1:7890)，代理没开时一切 install 失败；
  用 `npm install --userconfig /dev/null --registry https://registry.npmjs.org ...` 绕过，别改全局配置。
- **视觉系统从标识推导，只用墨黑与米白**（2026-08-08，来源为 Claude Design 稿《tanku Anime 视觉改版》）：
  原深蓝底 + 荧光绿/暖橙/紫高亮全部废弃，层级只靠明度（ink 900–200 与 bone 050–400 两个色阶）。四个构件
  全部来自 logo：方块（卡片一律 10px 圆角）、底边缺口（当前导航/标签/剧集的选中态）、双横眼（AI 标签、
  封面装饰）、短横（当前行与保存成功指示）。播放器字幕为透明底、正常字重的白字轻阴影，不使用构件背景，避免遮挡画面；
  错误状态不引入红色，用米白反转底表达最强对比；
  成功状态用短横指示器。字体为 Space Grotesk（仅品牌字标）/ Noto Sans JP（正文）/ JetBrains Mono（标签与
  快捷键），经 Google Fonts CDN 引入并带系统字体回退，离线时自动降级为 Hiragino Sans 等系统字体。
  解析面板整面反转为米白，是页面上唯一的大面积亮色，用来强调「学习内容」优先级。
- **启动预检分级：Node 版本硬失败，FFmpeg 只警告**（2026-08-08）：better-sqlite3 锁 v11 使非 22 大版本
  必然坏在难排查的位置，因此 `npm start` 先检查并带指引退出；FFmpeg 缺失不阻断发现页、生词本和已导入媒体，
  CI runner 也不保证有 ffmpeg，故只打印按平台的警告后继续启动。`TANKU_SKIP_PRECHECK=1` 为逃生口。
  预检逻辑在 `scripts/precheck.mjs`（纯函数 + 注入 exec，保持 start.mjs 纯 Node 可运行），
  配套 `precheck.d.mts` 声明供 server 测试与 `tsc --noEmit` 引用。
- **JMdict 一键安装默认锁定已验证 release**（2026-08-08）：`npm run setup:jmdict` 默认下载
  `3.6.2+20260720135044`（与导入基线一致），`--latest` / `--tag` / `JMDICT_TAG` 可覆盖。zip 解压用零依赖
  fflate（`unzipSync` 一次性 buffer，设置脚本场景可接受；测试用 `zipSync` 造内存夹具，不提交二进制）。
  下载先写 `.download` 临时文件、成功后 rename，失败不留半成品并提示手动 import-jmdict 兜底。
  `JMDICT_VENDOR_DIR` 只用于验证与测试隔离，正常用户不需要设置。

- **日剧不镜像 TMDB 目录，只手写精选**（2026-08-14）：[TMDB API 条款](https://www.themoviedb.org/api-terms-of-use)
  禁止缓存超过 6 个月，且 TMDB Content 不得再分发，因此**放弃「拉一次数据当默认模板提交进仓库」**的方案
  （用户提出，核实条款后否决）。除条款外还有两个实际理由：日剧按クール更新，快照一季就过时，首页显示
  半年前的剧比空着更糟；这与 §8「不把外部目录当作可永久镜像的项目资产」直接冲突。替代方案是
  `drama/editorial.ts` 里 Daniel 手写的学习向精选——原创内容、不会过期、且是本项目独有的价值。
  海报**只存 `image.tmdb.org` 的 URL 不存图片文件**（版权素材不进仓库），与番剧侧 AniList 封面的既有做法一致。
- **播放页在两个模式下都保持墨黑**（2026-08-15）：播放页是「观看」界面而非「浏览」界面，白底在暗环境刺眼
  且降低画面对比度；更重要的是会让「解析面板是页面上唯一大面积亮色」这条强调学习内容的原则反向失效。
  实现上不复制任何 CSS——token 声明挂在 `[data-mode]` 属性选择器上，靠自定义属性沿 DOM 继承，
  `effectiveMode(mode, pathname)` 对 `/play/` 开头的路由返回 `anime` 写到 `<html>` 即可。
- **Nyaa 真人剧子分类与动画不是平行编号**（2026-08-15，已在 nyaa.si 实测）：动画的第 1 位是 AMV，
  真人剧没有 AMV 而把英译放在第 1 位。英文字幕 `1_2`↔**`4_1`**、非英文 `1_3`↔**`4_2`**、Raw `1_4`↔**`4_4`**，
  `4_3` 是 Idol/PV。「把 1 改成 4」会静默搜到偶像 PV 和演唱会，因此分类表按内容类型拆成两张并有回归测试锁定。
  Nyaa 缓存键也必须带 `kind`，否则同一查询词会在两种内容之间串味。
- **精选清单按「听力难度」分级，而不是按人气或评分**（2026-08-15）：15 部作品各带 `level`
  （`N3` / `N2` / `N1` / `N1+`），首页从易到难排列，另有 1 部（昼顔）占据横幅位。分级参考了
  中文圈按 JLPT 难度编排的日剧精讲合集所反映的实际教学取舍，作品名是客观事实，推荐理由为本项目原创。
  这条正是 §8「后续发现功能应朝按水平/对话密度推荐靠拢」的落地——比通用人气榜有价值的地方就在这里。
  `level` 只存在于手写条目，TMDB 来源的作品没有该字段（`CatalogDrama.level` 为可选）。
  **电影不进清单**：`新幹線大爆破` 等虽在参考合集中出现，但学习管线是围绕剧集建的
  （jimaku 按 series→entry 映射、文件名解析要抽集数），为单片加 `/movie/` 分支不划算。
  **续作不单独立项**：`ドラゴン桜2`、`ブラックペアン2`、`VIVANT` S2 在 TMDB 上没有独立 ID，
  都挂在 S1 条目下；本清单保持「一作品一行」，不引入季度字段。
- **整季包优先的判定要认得日剧的集数写法**（2026-08-15）：原规则只认 `SxxExx` 与 ` - 13`，
  而日剧发布普遍写成 `Title EP13` 或 `第3話`（无分隔符），导致单集与整季包同被判为「范围不明」，
  再按做种数排序时单集胜出——实测 VIVANT 的整季包被压到第 6 位。现已补 `EP\d+` / `第N話` 为单集，
  `EP01-10` / `全N話` 为整季。另外「标题无集数标记」的候选改为按体积分级：实测 VIVANT 通し 25.3 GiB、
  外传 2.4 GiB、单集 1.4 GiB，体积是区分「整季」与「单发特别篇」的可靠信号。
- **日文搜索 0 命中时自动回退到罗马字读音**（2026-08-15）：Nyaa 实写分类的发布名大量使用罗马字，
  日文原题可能一条都搜不到。用已有的 kuromoji 取读音，经 `analyze/romaji.ts` 转成ヘボン式，
  作为第二检索语交给 provider（provider 本就「按顺序试，取第一个非空」）。实测「きのう何食べた」
  日文 0 件 →「Kinou Nani Tabeta」48 件且全部为该作。翻字失败不影响搜索本身（catch 后只用原输入）。
  助詞 は/へ/を 按发音拼成 wa/e/o；长音记号丢弃以吸收 グルメ/グールメ 之类的写法差异。
  页面同时显示「你输入的词」和「实际命中的词」，回退过程对用户可见。
- **日剧检索优先用罗马字而非日文原题**（2026-08-15 实测）：Nyaa 实写分类里发布组大量使用罗马字命名。
  `アンナチュラル` 0 件 vs `Unnatural` 20 件；`きのう何食べた` 0 件 vs `What Did You Eat Yesterday` 4 件。
  且**当用的是「原题的罗马字转写」而非官方英译**——`We Married as a Job` 0 件、
  `Nigeru wa Haji da ga Yaku ni Tatsu` 29 件。精选清单因此带 `titleRomaji` 字段并映射进 `titleEnglish` 参与检索。
- **TMDB 不可用时回退本地精选，不阻断资源搜索**（2026-08-15）：原设计遗漏了这个分支，导致一个倒挂——
  没配 token 的用户精选剧资源搜索照常工作，配了 token 但 TMDB 挂掉时同一部剧反而 502。
  Nyaa 与 jimaku 都不经过 TMDB，TMDB 的可用性不该决定「这部精选剧能不能下载和学习」。
  现由 `drama/routes.ts` 的 `resolveDrama()` 统一处理：无 token / TMDB 返回 null / TMDB 抛错且命中精选 →
  用本地条目；不在精选清单里才 502。与「AniList 故障只影响发现页」是同一原则。
- **jimaku 候选合并动画与真人剧，媒体库不区分内容类型**（2026-08-15）：候选搜索同时请求
  `anime=true` 与 `anime=false` 并按 entry id 合并去重，单边失败不影响另一边。这样 `media` 表不需要
  kind 字段、不需要新 UI、番剧侧行为零退化——候选本来就是「人工选一次后记住映射」，与合并天然吻合。

- **日剧检索目录用 Bangumi，而不是恢复 TMDB 或抓 Wikipedia**（2026-08-16）：08-15 去掉 TMDB 后搜索框只剩 Nyaa
  直搜，用户要求恢复「有海报有简介」的作品卡片。约束是**不能再要 token**（去 TMDB 就是为了零配置）。实测三个
  免 key 候选：Bangumi `POST /v0/search/subjects`（type=6 三次元）有日文原题、海报直链、0–10 评分、话数、
  `platform` 字段（`日剧`/`电影`/…可直接过滤）、infobox 里的拉丁别名（如 `UNNATURAL`，正好是 Nyaa 命中率
  最高的检索词）与电视台，且大量简介就是官方日文文案；日文 Wikipedia 有日文简介但海报几乎全缺、搜索噪音大；
  TVmaze 日文标题基本搜不到。代价：Bangumi 是社区库，冷门老剧可能缺、部分简介为中文。Bangumi id 与精选的
  TMDB id 是两个名字空间，因此走独立前缀 `/api/drama/bgm/:id`、`/drama/bgm/:id`，精选路由与清单一行未动；
  搜索命中与精选同名时并入 `level`/`recommendation`/`titleRomaji`。Bangumi API 要求可识别的 User-Agent，
  客户端固定发 `tanku-anime/<version> (<repo url>)`。数据仍只做 10 分钟进程内缓存，不入库、不进仓库。

- **服务端外呼的代理支持交给 Node 内置开关，不引入 undici 依赖**（2026-08-15）：Node 全局 `fetch`
  不读系统代理，也不读 `HTTPS_PROXY`，这是国内用户「资源搜索只剩 nyaa 外链」的根因。Node 22.21 起自带
  `NODE_USE_ENV_PROXY=1` / `--use-env-proxy`（官方文档已核实），能让全局 fetch 走 `HTTP(S)_PROXY`，
  且 `start.mjs` 原样透传环境变量，因此选择只做文案 + README 指引，不为此加 `undici` 依赖或自写
  ProxyAgent。代价：Node 22.12–22.20 的用户没有这个开关，只能靠代理软件的 TUN 模式；已在提示中写明版本要求。
  `start.mjs` 自动补 `NODE_USE_ENV_PROXY=1` 的想法暂不做，等确认新版 Node 用户仍会漏设第二个变量再说。

- **安装摩擦按「双击启动器 → 一行安装脚本 → （观望）桌面应用」的顺序解决**（2026-08-16 确认，2026-08-17 前两项落地）：
  已有真实用户卡在安装，awesome-japanese 维护者也指出同类播放器普遍对非技术用户不友好。`npx` 方案被排除
  （它也要先有 Node，帮不到目标人群）；Tauri/Electron 需数周加 Apple 开发者账号，等真实反馈再定，不提前投入。
- **安装脚本用源码 tarball，不依赖 git**（2026-08-17）：全新 Mac 上一调 `git` 就弹 Xcode 命令行工具安装框
  （几百 MB）。tarball 解压到 `~/tankuanime`，重跑即更新（不删除 tarball 里没有的文件，因此 `server/data`、
  `server/vendor`、`node_modules`、`.tools` 全部保留）；若目录已是 git 检出则改走 `git pull --ff-only`，
  不覆盖开发者自己的 clone。
- **Node 22 直接下载 nodejs.org 官方包到应用私有的 `.tools/node`，不用 fnm、不用 winget/brew**（2026-08-17）：
  最初设想是 fnm，但直接下载官方包同样绕开「LTS 别名装成 24」的坑，而且不需要 shell 集成、不改任何用户配置、
  不影响用户已装的其他版本 Node；启动器只需把 `.tools/node/bin` 前置到 PATH。SHA-256 对照官方 `SHASUMS256.txt`。
  代价：用户在自己终端里敲 `npm` 时用的仍是系统 Node（可能没有）——目标人群不需要，技术用户走手动路径。
- **FFmpeg 优先复用 PATH，否则装到应用私有的 `.tools/ffmpeg`，来源限定 ffmpeg.org 官网链接的构建**（2026-08-17）：
  macOS 有 Homebrew 时 `brew install ffmpeg`；没有时下载 evermeet.cx 静态包（官网 macOS 栏目唯一链接；仅 x86_64，
  Apple Silicon 依赖 Rosetta 2——脚本先探测，缺失时尝试 `softwareupdate --install-rosetta`，这是全脚本唯一可能要
  密码的分支）。Windows 下载 gyan.dev essentials 只取两个 exe，不走 winget（避免依赖 winget 存在、UAC 弹窗与系统
  PATH 修改）。Linux 只提示包管理器。server 通过 PATH 找 `ffmpeg`/`ffprobe`，因此启动器前置 `.tools/ffmpeg` 即可，
  代码零改动。
- **启动器就绪后自动开浏览器只在 `TANKU_OPEN_BROWSER=1` 时启用**（2026-08-17）：默认 `npm start`、`verify:start`
  与 CI 行为不变；轮询逻辑放 `scripts/browser.mjs`（纯函数 + 注入 fetch，同 precheck 模式）。安装脚本结尾直接以
  启动器方式启动一次，既是首启体验也是对启动器的真实验证；`TANKU_NO_LAUNCH=1` 关闭（CI 用）。
- **可调参数只走环境变量，脚本零交互**（2026-08-17）：`curl | bash` / `irm | iex` 下 stdin 是管道，无法可靠提问；
  `TANKU_INSTALL_DIR` / `TANKU_REF` / `TANKU_NO_LAUNCH` / `TANKU_SKIP_JMDICT` 四个开关够用。

## 5. 已知小问题 / 待打磨

- jimaku_mapping.entry_name 存的是 ID 字符串而非作品名（仅备注字段，不影响功能，顺手可修）
- 视频自然播完时面板行为尚未单独定义（Space 双触发已于 2026-08-08 修复；原生 controls 已于 2026-08-11 换成自绘控制条）
- 「続き」需 positionSec>30 才显示；播放页尚无「从头开始/继续」选择
- H.264 10-bit 等当前浏览器仍不兼容的源没有后台转码兜底，只提示换源
- Windows 实机尚未完成“FFmpeg 探测/重封装 → 浏览器播放真实媒体 → 外部字幕”全链路；当前 CI 覆盖依赖、
  测试、构建、双进程启动、SQLite、目录 watcher、网页和健康接口。推广时必须保留这个区别。
- AniList 的作品简介多数是英文，首版不自动翻译；后续需真实使用确认是否值得接入缓存翻译
- 编辑推荐理由按 AniList ID 本地维护；新季度若没有配置，会自动退化为本季人气前三而无定制理由
- 新番目录依赖网络与 AniList 可用性；当前只有 10 分钟进程内缓存，服务重启后不会离线保留
- Nyaa RSS 依赖外网；网络或站点不可用时页面只能显示稳定错误并回退到 Nyaa 站内搜索链接。错误卡片会带上
  上游原因（如 `fetch failed (ENOTFOUND)` / 超时）与 `NODE_USE_ENV_PROXY` 提示，但 Node < 22.21 没有该开关，
  这类用户只能改用代理软件的 TUN 模式；AniList / jimaku 同样受服务端不走系统代理影响，目前只在文档说明
- 资源排序只能依据 Nyaa 元数据与标题模式；`trusted` 表示 Nyaa 站内标记，不等于版权许可或文件绝对安全
- 季度识别依赖标题中的明确标记；没有 `II/S02/Season 2/第2期` 等标记的续作可能被视为第一季，
  后续若真实遇到再引入 AniList 关系链人工校正，不为少数例外先做复杂映射。
- 智能排序只能从 Nyaa 标题和元数据里选“当前最好”；若没有单文件、整季且浏览器兼容的候选，第一项仍可能
  带转换警告或只能是分 Part 发布，页面必须保留警告，不能承诺绝对自动正确。
- 部分发布标题不写 H.264/H.265，页面会显示未知编码；下载后仍以现有 ffprobe/scanner 判断为准
- Web 字体走 Google Fonts CDN，离线或被墙时回退系统字体（品牌字标与 mono 标签观感略变，功能不受影响）；
  是否本地内嵌字体文件待真实使用后决定，注意 Noto Sans JP 体积较大
- Jimaku 的 `jimaku_mapping` 仍是一部本地 series 对应一个条目；像《无职転生》第一季这种在 Jimaku
  拆成前后半和特典三个条目的作品，当前需按集分段下载。现有 24 集已处理完成，但通用的分段映射 UI 尚未做。
- 部分 Jimaku SRT 是滚动式闭路字幕，会把同一句拆成相邻或短暂重叠的 cue；《无职転生》第 1 集
  12–14 秒附近可复现，字幕列表会看到少量重复句。当前保留源时间轴，后续应在真实使用确认后再做安全去重。
- OpenAI 提供商已用注入的 HTTP 响应完成路由回归测试，但尚未用用户真实 OpenAI Platform key 生成过讲解；
  配置后应完成一次 D 键实弹联调，再决定是否需要调整默认模型或输出 token 上限。
- Bangumi 检索的已知取舍：`platform` 只留 `日剧`，因此 Bangumi 归到「电影」的特别篇/剧场版不会出现在卡片里
  （仍可用「もっと探す」直搜）；部分条目简介为中文、`network` 为中文台名（如 `关西电视台`）；同一部剧的
  不同季在 Bangumi 是独立条目（`半沢直樹` 2013 / 2020 各一条），同名精选的难度与推荐理由会同时并入两条。
  Bangumi 资源检索词顺序为「原题 → 拉丁别名」，与精选一致，因此原题能搜到分集时不会再试别名下的整季包
  （与上一条 `アンナチュラル` 的限制同源）。
- 精选清单的 15 条推荐理由与难度分级是协作方起草的初稿，**尚未经 Daniel 定稿**。作品选择来自他提供的
  参考合集，但每条的 `badge` / `reason` / `level` 都应由他按自己的学习判断复核。
- `GTO` 在 TMDB 上有 1998 真人版（62057）、1999 动画版（43017）、2012 版（46127）与 2026 复活版（325022）；
  搜索时动画版排序靠前，清单锁定的是 1998 真人版。日后若要重新解析 ID，不能只按标题字符串匹配。
- 《重启》取 `リブート`（304194，2026 TBS）而非 `ブラッシュアップライフ`（中文名是《重启人生》）；
  若参考来源实指后者，需改这一条。
- `buildSeasonSearchQueries` 生成的 `S01` 后缀对日剧基本不命中（日剧发布文件名少见 `SxxExx`），
  实际靠裸标题兜底。目前够用，若真实使用中发现问题再考虑为日剧单独构造查询，不提前做。
- `カルテット`（Quartet）、`silent` 这类通用词做查询时，Nyaa 实写分类噪音较大；排序能缓解但不能消除。
- 罗马字回退只在日文查询**返回 0 条**时触发。若日文名能搜到一些结果（例如字幕组的分集发布）但整季包
  只存在于罗马字名下，就不会回退，前排仍是单集——`アンナチュラル` 即此例（整季包在 `Unnatural` 名下）。
  彻底解决需要把两路查询的结果合并，但 provider 的「按序试、取第一个非空」语义是番剧季度收窄依赖的，
  不能直接改成合并；若真实使用中反复遇到再单独为关键词搜索加合并路径。
- 日剧在 Nyaa 上的做种数普遍低于热门番剧，老剧可能无候选；页面保留「Nyaa で検索」外链兜底。
- 视觉改版遗留：`.editorial-card.surface-warm .pick-number` 在 anime 模式下原本只有 1.51:1 对比度
  （温白面上的浅色序号几乎不可见），已随双主题改造一并修正为 4.26:1。同类问题若在其他构件上出现，
  按「反色岛内部的文字用 `--on-invert-muted`」处理。

## 6. 下一步路线图

### 6.1 本地下载器与字幕自动衔接（资源交接 + 自动衔接已完成）

独立设计文档：`docs/superpowers/specs/2026-07-22-local-download-pipeline-design.md`。
自动衔接详细设计：`docs/superpowers/specs/2026-07-23-auto-media-subtitle-design.md`。

**已落地范围（2026-07-29）**：详情页按 AniList 日文/罗马字/英文标题与季度标记回退搜索 Nyaa RSS；
默认英语字幕分类，可切 Raw/全部；先过滤错季结果，再解析并校验 info hash、展示排序后的前 20 条；合法 `magnet:`
由本机默认应用接管。视频不经过 Fastify，也不进入部署服务器磁盘。当前 Mac 使用 Transmission，
默认保存到 `~/AnimeLibrary`。

**下载后的现有流程**：用户在 Transmission 确认并完成下载 → 文件直接写入 `MEDIA_DIR` → watcher 确认
15 秒稳定 → scanner/remux/ffprobe → 已有 jimaku 系列映射时自动按集数取得字幕；没有映射时媒体库顶部
提示一次并保留「字幕を探す」。已有映射但失败时显示脱敏原因与「再試行」，不清除映射。

**明确未做，先按真实使用反馈决定是否补**：下载意图状态机、下载进度页、AniList 与本地 series 映射、
qBittorrent/Transmission RPC、通过应用添加/暂停/删除下载任务。服务器端视频下载、自建 BitTorrent 客户端、
跨设备同步视频和远程删除用户文件仍不在范围内。
服务器端视频下载、自建 BitTorrent 客户端、跨设备同步视频和远程删除用户文件仍不在范围内。

### 6.2 动画发现后续（按真实使用反馈排序）

- “追番”列表：保存想看/在看状态，与本地媒体进度关联，而不是另做一套播放进度
- 作品详情与本地系列的人工一次匹配；之后从详情直接定位已有剧集和 jimaku 映射
- 作品简介本地化；优先按需翻译并缓存，不批量调用 AI
- 下一季度编辑推荐更新；没有本地推荐时继续使用人气前三的可靠降级

### 6.3 backlog（用户提过或预留，未排期）

- 学习模式严格版：暂停不自动显示字幕，再按一键才显示（spec 里留过口子，等使用反馈）
- 生词本内复习（简单间隔重复）；AnkiConnect 自动推送和真实 Anki 联调已完成
- 多字幕轨支持（一个视频多个 subtitle_file，切换）；字幕样式设置（字号等）
- 转码兜底：ffmpeg 后台把 H.264 10-bit 等未验证源转为浏览器兼容 H.264
- 播放页「继续/从头」选择；选集已完成，播完自动进入下一集尚未做
- 中文词典（2026-08-11 调查后暂缓，用户决定先不做）：JMdict/jmdict-simplified 无中文版；社区中日 Yomitan
  词典多为 weblio/沪江等商业词典抓取，许可存疑不宜打包。可行路线有二——① 支持导入用户自备的 Yomitan
  中日词典（本地即时、免费、许可由用户自负，需写 Yomitan term-bank 解析）；② 点词时用已配 AI 出中文释义
  并按词缓存。现状：词卡保留读音+英文释义，中文意思走 D 键 AI 讲解。想做时优先方案①。
- 应用内代理设置（2026-08-16 用户决定不做）：曾讨论给 server 加 `undici` ProxyAgent + 設定页「プロキシ URL」
  + 接続テスト，以及「問題を報告」一键诊断和 `npm run doctor`。首个国内用户反馈已通过「代理软件开
  TUN/增强模式，或 Node ≥ 22.21 加 `NODE_USE_ENV_PROXY`」解决，README 已写明两条路，用户判断不值得
  为此加依赖和 UI。除非后续反馈明显集中在这里，否则不要再重提。

### 6.4 开源发布与推广准备

- ~~确定并添加开源许可证。~~ **已完成（2026-08-04）**：采用 MIT，并在根目录加入 `LICENSE`；允许复用、修改与分发，同时保留署名和免责声明。
- **已完成（2026-08-06）**：增加 Node 22 GitHub Actions CI（`npm test` + web build）、Dependabot、`SECURITY.md`、`CODE_OF_CONDUCT.md` 和 Issue / PR 模板；贡献约定已要求中、日、英 README 在用户可见改动时同步更新。
- **已完成（2026-08-06）**：README 现有英文主入口、简体中文与日文版本，明确公开仓库地址、macOS 已验证边界、本地数据风险和漏洞私密报告路径。
- **已完成（2026-08-08）**：修复 Windows 启动脚本；CI 增加 Windows；三语 README 与 AI 安装指南补齐
  精确 Node 22、FFmpeg/ffprobe、better-sqlite3、PowerShell 路径、magnet 下载器和 HEVC 边界。Windows 空媒体
  全新安装已通过公开仓库的一句指令验证：依赖、测试、构建、单一 `npm start`、后端健康接口和前端页面均正常。
  后续只剩用自有 H.264 样片完成真实媒体播放闭环。
- **已完成（2026-08-08）**：`npm start` 启动预检（Node 22 硬检查 + FFmpeg 分级警告）与 `npm run setup:jmdict`
  一键词典安装落地，三语 README 与 `docs/AI-SETUP.md` 同步。设计见
  `docs/superpowers/specs/2026-08-08-onboarding-precheck-and-jmdict-setup-design.md`。安装侧剩余的主要摩擦是
  better-sqlite3 对 Node 22 的锁定；`node:sqlite` 迁移评估未排期。
- **已完成（2026-08-17）**：双击启动器（`tanku Anime.command` / `.bat`，就绪后自动开浏览器）与一行安装脚本
  （`scripts/install.sh` / `install.ps1`，源码 + 官方 Node 22 + FFmpeg 全进 `~/tankuanime/.tools/`，重跑即更新），
  三语 README 快速开始已改为「一行安装 → 双击启动」在前、手动步骤在后。设计见
  `docs/superpowers/specs/2026-08-17-launcher-and-install-script-design.md`。**未闭环**：Windows 侧只有 CI 实跑，
  `.bat` 双击与桌面 `.lnk` 等真实 Windows 用户确认；非技术用户中文上手指南（`~/Documents/tanku/文案/` 草稿）
  待用户确认后翻英文进 `docs/GETTING-STARTED.md`，其中 winget 装 FFmpeg 的段落应改为直接引用一行安装命令。
  下一步是桌面应用（Tauri/Electron），明确等真实反馈再定。
- 为 README 提供无版权风险的截图或短演示；可用空媒体库或演示数据拍摄，不能纳入未授权动画片段、字幕或个人文件名。
- 发布第一个带清晰版本号和变更说明的 GitHub Release；在此之前不要把仓库的预发布状态写成稳定版。
- 评估将本地 SQLite 中的 API key 改放入操作系统凭证库；公开发布前需先明确其本地存储和备份风险。
- 个人网站是独立的后续项目：先定义个人主页的信息架构、域名和托管方式，再将 tanku Anime 作为“项目”栏目中的单一入口。不要把播放器的本地媒体、下载或凭证能力部署到公共个人网站。

**推广原则（2026-08-06）**：优先积累可复用的公开资产（项目 README、开发日志、解决具体学习问题的短文章/演示）并让它们互相链接，再导向项目主页；不以抓取、搬运媒体或堆砌低价值 SEO 页面换取流量。该方向借鉴了对 `learn-py.org` 增长路径的公开调研：长期教程资产与 GitHub 入口比新域名冷启动更可持续。

## 7. 开发约定

- **TDD**：纯逻辑（解析、状态机、文件挑选、路由）先写 vitest 测试；外部依赖（ffmpeg/jimaku/AI API）
  全部依赖注入 fake。跑法：`npm test`（当前 server 246 + web 56，改完必须全绿；以实际输出为准）。
- **模块模式**：新功能 = `server/src/modules/<name>/routes.ts`（Fastify plugin，opts 传 db 和可注入依赖）
  + `index.ts` 注册 + `web/src/api.ts` 加方法。别在组件里直接 fetch。
- **UI**：颜色只用 index.css 的语义 token（`--bg` / `--text` / `--surface` / `--border` 等，声明在
  `[data-mode="anime"]` 与 `[data-mode="drama"]` 两个块里），**不要直接写 `--ink-*` / `--bone-*` 调色板变量**——
  那样在另一个模式下不会翻转。跟页面底色走的用语义 token，刻意与页面反差的面（选中态、错误提示、
  解析面板）用反色岛 token（`--invert-surface` / `--on-invert` / `--invert-border` 等）。
  两个模式的 token 键集必须保持一致。日文 UI 文案；学习模式相关逻辑进 learningMode.ts reducer（保持可测）。
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
- **全屏作用于视频容器而非 `<video>` 本身**：字幕是应用覆盖层，不属于原生视频元素；只把 `<video>`
  全屏会丢失字幕，因此隐藏原生全屏入口并提供包含状态徽标和字幕层的容器全屏按钮。
- **复习交接优先减少手工步骤**：用户已确认 TSV 手工导入不符合真实流程，现改用本机 AnkiConnect 一键推送；
  仍保持明确外部依赖和失败隔离，不读取或直接修改 Anki collection 数据库。
- **逐层自动化**：先让人工流程可靠，再自动匹配和串联；外部服务失败不能破坏本地播放与学习模式。
- **发现数据少取、短缓存、不囤积**：AniList 每页最多 20 条并缓存 10 分钟；仅保存本地编辑理由，
  不把外部目录当作可永久镜像的项目资产。
- **资源入口先安全可解释**：官方 streaming/info 与本地资源搜索分区；资源搜索必须由用户点击触发，
  只返回校验后的公开元数据和 magnet，并明确文件由本机下载器直接写入 `MEDIA_DIR`；本地助手只观察稳定文件，
  不以“搜索方便”为由让服务器或网站接管下载器和视频生命周期。

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
