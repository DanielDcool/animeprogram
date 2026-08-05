# 开发与产品交接文档

> 这是 Codex 与 Claude 共用的项目状态、关键决策和未来设计的唯一事实源。每次功能迭代后更新。
> 新会话接手工作前还应先读仓库根目录 `AGENTS.md`。历史设计过程见
> `docs/superpowers/specs/2026-07-21-jp-learning-player-design.md`（MVP 设计）与
> `docs/superpowers/plans/2026-07-21-jp-learning-player-mvp.md`（MVP 实现计划，已全部完成）。
> 动画发现功能见 `docs/superpowers/specs/2026-07-22-anime-discovery-design.md` 与对应 plan。
>
> 最后校对：2026-08-06。

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
               scanner.ts(指定文件/整目录扫描,返回新增ID) watcher.ts(稳定性检测+目录监听+周期对账)
               routes.ts(列表/手动scan/Range流)
    subtitle/  parser.ts(srt+ass→Cue{start,end,text}) routes.ts(句子列表+偏移)
    analyze/   tokenizer.ts(kuromoji惰性单例) dictionary.ts(JMdict查词)
               jmdict-import.ts(流式导入) routes.ts(/api/analyze)
    ai/        explain.ts(Anthropic / DeepSeek / OpenAI / Gemini API, structured outputs) routes.ts(/api/explain, SQLite缓存)
    jimaku/    client.ts(jimaku.cc API + pickBestFile) service.ts(可复用字幕下载)
               sync.ts(持久状态+去重串行自动取得) routes.ts(candidates/download)
    catalog/   client.ts(AniList GraphQL + normalize + 10分钟缓存)
               editorial.ts(本地学习向推荐理由) routes.ts(/api/catalog/*)
    resource/  provider.ts(统一资源类型) nyaa.ts(RSS解析/排序/5分钟缓存)
               routes.ts(/api/catalog/anime/:id/resources)
    vocab/     routes.ts(收藏 CRUD + TSV 导出)
    misc/      routes.ts(progress + settings)
web/src/
  api.ts                 唯一的后端调用出口（所有 fetch 都在这）
  pages/                 DiscoverPage / AnimeDetailPage / LibraryPage / PlayerPage / VocabPage / SettingsPage
  catalog/               view.ts（季度/状态/评分）resourceView.ts（资源显示纯函数）
                         ResourceResults.tsx（Nyaa 候选与 magnet 交接）
  player/                learningMode.ts(纯reducer,核心状态机) AnalysisPanel / TranscriptList / SubtitleOverlay
```

SQLite 表：`media, subtitle_file, progress, explain_cache, settings, dict, jimaku_mapping, subtitle_sync_state, vocab`
（settings 存 `ai_provider` / `anthropic_api_key` / `deepseek_api_key` / `openai_api_key` / `gemini_api_key` /
`jimaku_api_key` / `ai_model`，凭证值不得进入日志、测试或文档）。

## 3. 已完成功能

| 功能 | 关键位置 |
|------|----------|
| 媒体扫描：mkv 自动 remux 成 .play.mp4、抽内嵌字幕、外部 `.ja.srt` 优先 | media/scanner.ts |
| H.265/HEVC Main 10 在当前 Mac 浏览器只 remux 不转码；H.264 10-bit 等不兼容源仍标记「要トランスコード」 | media/ffmpeg.ts decidePlayability |
| 学习模式：默认无字幕；Space 暂停+显示；A 回句首（快速连按回上一句）；←/→ 跳句；S 常显；[ ] 偏移±100ms；页面快捷键提示可直接点击 | player/learningMode.ts + PlayerPage |
| 桌面播放器布局：视频/解析面板之间可拖动调宽并记住宽度；自定义全屏会将视频、状态和字幕层一起全屏 | PlayerPage + playerLayout.ts |
| 右侧面板双 Tab：解析（分词chip+词卡+AI讲解）/ 字幕一覧（T 键，打开即定位当前句，点句=SELECT跳转+暂停+解析） | AnalysisPanel / TranscriptList |
| 本地分析：kuromoji 分词+变形还原，JMdict 查词（需手动导入，见 README） | analyze/* |
| AI 深度讲解：D 键，设置页可选 Anthropic、DeepSeek、OpenAI（Codex / GPT）或 Google Gemini；统一输出{翻译/语法结构/表现/语气}，只给原句中出现的日语汉字标读音，解释新增术语不标；按格式版本/服务/模型/句子缓存 | ai/explain.ts |
| jimaku 字幕匹配：候选选择一次→jimaku_mapping 记住→按 episode 自动下载(.srt优先,跳过压缩包) | jimaku/* |
| 生词本：词/句收藏（带出处+时间戳，去重），単語帳页面，Anki TSV 导出 | vocab/routes.ts + VocabPage |
| 观看进度：5 秒一存，媒体库显示「続き」 | misc/routes.ts |
| 动画发现：首页实时显示当前季/上季、学习向 3 部推荐、日/英/罗马字搜索、响应式卡片 | catalog/* + DiscoverPage |
| 作品详情：简介/评分/制作公司、AniList HTTPS 官方播放与官网链接、本地媒体库入口 | AnimeDetailPage |
| 本机下载交接：按季度过滤错季结果，整季/可直接播放/1080p/可信/多字幕智能排序，再用合法 magnet 交给本机下载器 | resource/* + ResourceResults |
| 本地媒体自动衔接：监听 MEDIA_DIR，文件稳定后自动扫描；已有 Jimaku 映射自动取字幕，无映射/失败在媒体库非打断提示 | media/watcher.ts + jimaku/sync.ts + LibraryPage |

**已验证基线（截至 2026-08-02）**：

- jimaku 用真实 key 联调通过：《葬送のフリーレン》第 1 话字幕真实下载并解析出 265 句；测试媒体已清理，系列映射保留。
- 生词本在浏览器中完成“收藏单词 + 收藏句子 → 列表展示 → TSV 导出”链路；演示数据已清理。
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
- 自动测试基线为 server 113 个、web 23 个；server/web TypeScript noEmit 与 web production build 通过。
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

## 4. 关键决策记录（为什么这么做）

- **本地 Web 应用而非 Electron/mpv 插件**：开发快、UI 灵活、用户可远程访问；用户确认过。
- **mkv 处理用 remux 而非转码**：H.264 与已在当前 Mac 浏览器验证的 HEVC Main 10 都只换封装；
  视频流原样复制、音轨统一转 AAC，字幕轨单独走统一管线。H.264 10-bit 等未验证编码不冒险放行。
- **AI 引擎分层**：本地分词零成本秒出（每次暂停都跑），AI 解说只在按 D 时调用且缓存；当前支持
  Anthropic、DeepSeek、OpenAI 与 Gemini。DeepSeek 按官方 JSON mode 调用，OpenAI 按 Responses API、
  Gemini 按 Interactions API 的严格 JSON Schema 调用；Gemini 请求关闭服务端保存。设置中所谓“Codex key”
  实际为 OpenAI Platform API key，与 ChatGPT / Codex 订阅分开。
- **Anki 用 TSV 导出而非 AnkiConnect**：不依赖 Anki 在跑/装插件；以后要一键推送再加。
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
  不变后才扫描。scanner 探测失败不入库，之后可重试。Jimaku 只在已有人工映射时自动串行请求；没有映射
  不猜测、不弹窗，失败保留映射和脱敏原因。手动扫描继续作为恢复入口。
- **Nyaa 候选先按季度收窄再排序**：从 AniList 日文/罗马字/英文标题中的 `II/III`、`S02/S03`、
  `Season 2/3`、`第2期/第3期` 推断季度，无标记视为第一季；先用 `S01/S02` 查询，解析完整 RSS 后过滤
  错季，再按整季包、无需转换、H.264/AVC、1080p、合理体积、非 remake、可信标记、多字幕、做种数的
  顺序取前 20 条。H.264 10-bit 同样视为需转换，避免只看编码名称误判浏览器兼容性。
- **better-sqlite3 锁 v11**：v13 prebuilt 在这台 Mac(arm64, Node 22.12) `new Database()` 直接 segfault。**不要升级**。
- **npm 安装**：用户 ~/.npmrc 走 Clash 代理(127.0.0.1:7890)，代理没开时一切 install 失败；
  用 `npm install --userconfig /dev/null --registry https://registry.npmjs.org ...` 绕过，别改全局配置。

## 5. 已知小问题 / 待打磨

- jimaku_mapping.entry_name 存的是 ID 字符串而非作品名（仅备注字段，不影响功能，顺手可修）
- 视频自然播完时面板行为、原生控制条 Space 与快捷键 Space 可能双触发（实测未出问题，留意）
- 「続き」需 positionSec>30 才显示；播放页尚无「从头开始/继续」选择
- H.264 10-bit 等当前浏览器仍不兼容的源没有后台转码兜底，只提示换源
- AniList 的作品简介多数是英文，首版不自动翻译；后续需真实使用确认是否值得接入缓存翻译
- 编辑推荐理由按 AniList ID 本地维护；新季度若没有配置，会自动退化为本季人气前三而无定制理由
- 新番目录依赖网络与 AniList 可用性；当前只有 10 分钟进程内缓存，服务重启后不会离线保留
- Nyaa RSS 依赖外网；网络或站点不可用时页面只能显示稳定错误并回退到 Nyaa 站内搜索链接
- 资源排序只能依据 Nyaa 元数据与标题模式；`trusted` 表示 Nyaa 站内标记，不等于版权许可或文件绝对安全
- 季度识别依赖标题中的明确标记；没有 `II/S02/Season 2/第2期` 等标记的续作可能被视为第一季，
  后续若真实遇到再引入 AniList 关系链人工校正，不为少数例外先做复杂映射。
- 智能排序只能从 Nyaa 标题和元数据里选“当前最好”；若没有单文件、整季且浏览器兼容的候选，第一项仍可能
  带转换警告或只能是分 Part 发布，页面必须保留警告，不能承诺绝对自动正确。
- 部分发布标题不写 H.264/H.265，页面会显示未知编码；下载后仍以现有 ffprobe/scanner 判断为准
- Jimaku 的 `jimaku_mapping` 仍是一部本地 series 对应一个条目；像《无职転生》第一季这种在 Jimaku
  拆成前后半和特典三个条目的作品，当前需按集分段下载。现有 24 集已处理完成，但通用的分段映射 UI 尚未做。
- 部分 Jimaku SRT 是滚动式闭路字幕，会把同一句拆成相邻或短暂重叠的 cue；《无职転生》第 1 集
  12–14 秒附近可复现，字幕列表会看到少量重复句。当前保留源时间轴，后续应在真实使用确认后再做安全去重。
- OpenAI 提供商已用注入的 HTTP 响应完成路由回归测试，但尚未用用户真实 OpenAI Platform key 生成过讲解；
  配置后应完成一次 D 键实弹联调，再决定是否需要调整默认模型或输出 token 上限。

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
- AnkiConnect 一键推送；生词本内复习（简单间隔重复）
- 多字幕轨支持（一个视频多个 subtitle_file，切换）；字幕样式设置（字号等）
- 转码兜底：ffmpeg 后台把 H.264 10-bit 等未验证源转为浏览器兼容 H.264
- 播放页「继续/从头」选择；剧集自动连播

### 6.4 开源发布与推广准备

- ~~确定并添加开源许可证。~~ **已完成（2026-08-04）**：采用 MIT，并在根目录加入 `LICENSE`；允许复用、修改与分发，同时保留署名和免责声明。
- **已完成（2026-08-06）**：增加 Node 22 GitHub Actions CI（`npm test` + web build）、Dependabot、`SECURITY.md`、`CODE_OF_CONDUCT.md` 和 Issue / PR 模板；贡献约定已要求中、日、英 README 在用户可见改动时同步更新。
- **已完成（2026-08-06）**：README 现有英文主入口、简体中文与日文版本，明确公开仓库地址、macOS 已验证边界、本地数据风险和漏洞私密报告路径。
- 为 README 提供无版权风险的截图或短演示；可用空媒体库或演示数据拍摄，不能纳入未授权动画片段、字幕或个人文件名。
- 发布第一个带清晰版本号和变更说明的 GitHub Release；在此之前不要把仓库的预发布状态写成稳定版。
- 评估将本地 SQLite 中的 API key 改放入操作系统凭证库；公开发布前需先明确其本地存储和备份风险。
- 个人网站是独立的后续项目：先定义个人主页的信息架构、域名和托管方式，再将 Kotoba Anime 作为“项目”栏目中的单一入口。不要把播放器的本地媒体、下载或凭证能力部署到公共个人网站。

**推广原则（2026-08-06）**：优先积累可复用的公开资产（项目 README、开发日志、解决具体学习问题的短文章/演示）并让它们互相链接，再导向项目主页；不以抓取、搬运媒体或堆砌低价值 SEO 页面换取流量。该方向借鉴了对 `learn-py.org` 增长路径的公开调研：长期教程资产与 GitHub 入口比新域名冷启动更可持续。

## 7. 开发约定

- **TDD**：纯逻辑（解析、状态机、文件挑选、路由）先写 vitest 测试；外部依赖（ffmpeg/jimaku/AI API）
  全部依赖注入 fake。跑法：`npm test`（当前 server 113 + web 23，改完必须全绿）。
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
- **全屏作用于视频容器而非 `<video>` 本身**：字幕是应用覆盖层，不属于原生视频元素；只把 `<video>`
  全屏会丢失字幕，因此隐藏原生全屏入口并提供包含状态徽标和字幕层的容器全屏按钮。
- **可移植输出优先**：当前用 Anki TSV 而非强绑定插件；只有真实使用证明一键推送有价值时再引入 AnkiConnect。
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
