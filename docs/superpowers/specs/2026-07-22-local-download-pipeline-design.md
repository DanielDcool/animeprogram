# 本地下载器与字幕自动衔接设计

日期：2026-07-22  
状态：资源搜索首版与本地自动衔接均已实施；下载进度/RPC 仍是未来方案

> 2026-07-23 更新：稳定文件监听、自动扫描、已有 Jimaku 映射自动取字幕、无映射/失败的媒体库提示，
> 已按 `docs/superpowers/specs/2026-07-23-auto-media-subtitle-design.md` 实施。本文关于“手动扫描”的描述
> 保留为 2026-07-22 首版历史；当前行为以新设计与 `docs/DEVELOPMENT.md` 为准。

## 1. 背景与目标

用户提供的原始学习流程截图明确写有：播放器使用 asbplayer、查词使用 Yomitan、番剧下载使用
`nyaa.si`、日语字幕使用 `jimaku.cc`。本项目已经用自建播放器替代 asbplayer、用 kuromoji + JMdict
替代 Yomitan，并完成 jimaku 字幕匹配；剩余缺口是把“搜索番剧资源 → 交给本机下载器 → 下载完成后进入学习模式”接入现有网站。

本功能的目标：

1. 在动画详情页搜索与当前作品相关的资源。
2. 视频数据直接由用户电脑上的下载器写入用户选择的本地目录，不经过、不暂存于部署网站服务器。
3. 下载完成后由本地助手确认文件稳定、自动扫描，并复用 jimaku 字幕匹配和学习播放器。
4. 远程目录服务故障、Nyaa 不可用或本地下载器未启动时，不影响已有本地媒体库与学习功能。
5. 所有下载必须由用户明确触发；应用只用于用户有权获取的内容。

## 2. 核心判断

### 2.1 可以实现，但不能只靠一个远程网页

浏览器不能静默选择任意本地目录，也不能让远程服务器直接监控用户电脑上的下载状态。完整体验需要两部分：

- **目录网站**：展示动画资料、查询资源元数据、生成 magnet 链接。
- **本地助手**：当前项目的 Fastify 服务已经运行在用户电脑上，可扫描本地媒体目录、访问本机下载器、
  下载字幕并启动播放器。

当前 `npm start` 形态本身就是“网页 UI + 本地助手”，因此第一版不需要 Electron。将来若把目录网站部署到公网，
仍需用户安装并启动本地助手；公网服务器不能替代它访问本地目录。

### 2.2 首版使用通用 magnet 协议，当前 Mac 配置 Transmission

网页只输出标准 `magnet:` 链接，不依赖某个下载器 API。下载、暂停、校验、断点续传和做种生命周期
交给成熟本机客户端，不在本项目里重造 BitTorrent 客户端。

2026-07-22 实施时先安装了 qBittorrent 5.2.3，但 Homebrew 已提示其 cask 因 macOS Gatekeeper 校验
问题被弃用，本机签名校验也不受信任，因此没有绕过系统安全检查。随后安装并配置 Transmission 4.1.3：
它已成为 magnet 默认应用，默认保存目录为 `/Users/daniel/AnimeLibrary`，打开 magnet 时仍显示确认窗口。
qBittorrent WebUI 只保留为未来可选的深度集成方向，不是首版依赖。

## 3. 资源来源

### 3.1 Nyaa 搜索

资源搜索默认使用 Nyaa 的 RSS 搜索结果。服务端只请求并归一化以下元数据：

- 标题与详情页地址
- magnet / info hash
- 文件大小
- 发布时间
- seeders、leechers、完成次数
- trusted / remake 标记
- 分类与字幕组/发布组（从标题提取，仅作显示和筛选）

默认搜索动画分类，优先带英文字幕的日语音轨发布；允许用户切换 Raw 或全部动画分类。搜索词依次使用
AniList 日文标题、罗马字标题和英文标题；前一个标题没有结果时才尝试下一个。结果排序后最多 20 条，缓存 5 分钟。

Nyaa 只作为可替换的 `ResourceProvider` 实现，UI 和下载状态不直接依赖其 HTML。若 RSS 不可用，页面显示明确错误，
并提供打开对应站内搜索页的外部链接；不解析易变的页面 DOM。

### 3.2 服务器边界

部署服务器不得：

- 下载或缓存视频内容。
- 代理 BitTorrent 数据。
- 保存用户本地目录结构。
- 自动替用户启动下载。

部署服务器可以：

- 查询和短暂缓存公开资源元数据。
- 将经过校验的 magnet 链接返回浏览器。
- 保存 AniList 作品与搜索词之间的非敏感映射。

## 4. 用户流程

### 4.1 第一次设置

1. 用户安装能处理 magnet 的本机下载器；当前推荐 Transmission。
2. 在下载器中将默认保存目录设为本项目媒体目录，默认是 `~/AnimeLibrary`。
3. 首版不在应用设置页控制下载器；是否能接管 magnet 和保存目录由下载器自身设置确认。
4. 不读取 RPC/WebUI 进度；本地助手观察 `MEDIA_DIR` 稳定文件，手动扫描仅作恢复入口。

### 4.2 搜索与下载

1. 用户在 `/anime/:id` 点击「ダウンロードを探す」。
2. 页面加载 Nyaa 搜索结果，显示标题、发布组、分辨率、编码、大小、seeders 与更新时间。
3. 默认排序优先级：可信发布 → seeders → 1080p → H.264 → 发布时间较新。
4. H.265/10bit 结果显示「ブラウザ再生に変換が必要」警告；不假装可直接播放。
5. 用户点击「ローカルのダウンロードアプリで開く」，浏览器导航到由合法 info hash 构造的 `magnet:` 链接。
6. Transmission（或其他默认应用）打开添加窗口，用户最终确认文件和本地保存目录；首版不记录下载意图。

### 4.3 下载完成与字幕

以下自动衔接范围已于 2026-07-23 实施；下载意图和下载器进度仍未实现。

1. 本地助手监控 `MEDIA_DIR`，只处理第一层 `.mkv/.mp4`，忽略隐藏文件和 `.play.mp4`。
2. 发现支持的视频扩展名后，等待大小与 mtime 连续 15 秒稳定，再调用现有 scanner；`fs.watch` 只作唤醒，
   30 秒周期对账负责兜底，不依赖下载器进度。
3. scanner 继续负责文件名解析、ffprobe、必要的 mkv remux、内嵌字幕抽取和 `media` 入库。
4. 当前不记录下载意图或 AniList 关联；series 继续来自现有文件名解析。
5. 若已有该系列的 `jimaku_mapping`，自动按集数取得字幕；没有映射时显示现有候选选择界面，不盲猜。
6. 媒体库显示 `needs_mapping/downloading/failed/ready`；顶部只统计待选择作品，失败保留映射并可重试。

## 5. 页面设计

### 动画详情页

- 在「公式で見る・調べる」下增加「ローカル用リソース」。
- 主按钮：「ダウンロードを探す」。
- 结果使用抽屉或页面内区块，不跳离作品详情。
- 每条显示：发布标题、发布组、1080p/720p、H.264/H.265、大小、seeders、更新时间。
- 操作：「ローカルのダウンロードアプリで開く」「Nyaa で詳細を見る」。

### 下载状态

- 顶部导航增加轻量「ダウンロード」入口，仅在存在下载意图时显示数量。
- 状态页展示等待外部下载器、下载进度、扫描、字幕、完成与失败原因。
- 第一版无法读取 qBittorrent 时显示「ダウンロード完了後、フォルダをスキャン」降级操作。

## 6. 系统组件

### 服务端

当前没有 `download/` 模块；资源查询仍在 `resource/`，目录监听复用 `media/`，字幕自动化复用 `jimaku/`。

```text
server/src/modules/resource/
  provider.ts       ResourceProvider 接口与统一结果类型
  nyaa.ts           RSS 查询、解析、缓存和结果排序
  routes.ts         /api/catalog/anime/:id/resources

server/src/modules/media/watcher.ts    MEDIA_DIR 稳定文件检测与周期对账
server/src/modules/jimaku/service.ts   路由/后台共用字幕下载
server/src/modules/jimaku/sync.ts      持久状态与串行自动取得
```

自动衔接已新增 `subtitle_sync_state`；更完整的下载器集成才可能新增：

- `download_intent`：AniList ID、info hash、资源标题、状态、关联 media ID、创建/更新时间。
- `catalog_media_mapping`：AniList 作品与本地 series 的一次人工确认映射。

不把 magnet、下载器密码或本地绝对路径同步到远程服务。qBittorrent WebUI 凭证只保存在本地 SQLite 设置中，
不得进入日志、测试夹具或文档。

### 前端

- `ResourceResults`：搜索结果、筛选、编码警告和 magnet 操作。
- `DownloadStatusPage`：本地下载、扫描、字幕状态。
- 所有请求继续集中在 `web/src/api.ts`。

## 7. 分阶段实现

> **范围决定（2026-07-22，用户确认）**：首版做**精简版**——只做「详情页搜 nyaa → 点击用本机
> 本机默认下载器打开 magnet」，下载完复用现有媒体库「フォルダをスキャン」按钮和 jimaku 流程。
> 2026-07-23 已补上 MEDIA_DIR 文件监控、自动扫描和字幕状态；仍不做下载意图状态机、下载状态页、
> `download_intent` 表或下载器 RPC。

### 精简版（首版实际范围，已完成）

- Nyaa RSS 搜索与结果归一化（`ResourceProvider` 接口 + `nyaa.ts` + 路由）。
- 动画详情页资源列表（前 20 条，标题/发布组/分辨率/编码/大小/seeders/日期）。
- info hash 校验后由服务端构造 `xt=urn:btih:` magnet，「ローカルのダウンロードアプリで開く」交给本机默认应用。
- H.265/10bit 结果显示需转换警告。
- 下载完成后由用户手动点媒体库「フォルダをスキャン」，走现有 scanner + jimaku 流程。
- 不新增 SQLite 表；不监控目录；不做下载状态页。

### 第一阶段（自动衔接子范围已完成）：可用的本地下载闭环

- Nyaa RSS 搜索与结果归一化。
- 动画详情页资源列表。
- magnet 打开本机下载器，由用户确认本地目录。
- 下载意图仍未记录。
- 监控 `MEDIA_DIR` 的稳定视频文件并自动扫描。
- 扫描后复用 jimaku 候选/映射和现有播放器。
- 无下载器 RPC/WebUI 时有明确的手动扫描降级。

### 第二阶段：下载器深度集成（qBittorrent WebUI 或 Transmission RPC）

- 本地连接测试与凭证设置。
- 精确显示进度、速度、剩余时间和失败状态。
- 通过 info hash 把 torrent 文件与 AniList 作品可靠关联。
- 下载完成后精确触发 scanner 和 jimaku。
- 是否直接通过 API 添加 magnet、是否自动设置保存目录，由用户单独开启；默认仍保留下载器确认窗口。

不在第一阶段实现：自建 BitTorrent 客户端、服务器端下载、跨设备同步视频、远程删除本地文件、自动停止做种。

## 8. 错误与安全

- magnet 必须包含合法 `xt=urn:btih:`，拒绝任意协议和脚本 URL。
- Nyaa 上游失败映射为可恢复错误，不影响 AniList 详情与本地学习。
- 文件监控只处理配置的媒体根目录内的支持格式，不执行下载内容中的程序或脚本。
- 目录空间不足、文件重名、下载取消和媒体编码不可播放都显示明确状态。
- 删除 torrent、删除本地文件、改变做种限制等操作不在首版范围内。
- 所有外部链接明确标注来源；用户在启动下载前进行最终确认。

## 9. 测试与完成标准

### 自动测试

首版已覆盖：

- RSS 解析、标题归一化、排序、缓存和上游错误。
- magnet 协议与 info hash 校验。
- 路由的 ID/分类校验、无作品、上游失败和稳定错误码。
- 前端资源元数据显示、兼容性提醒和不同加载状态文案。

自动衔接版本已覆盖：

- 文件大小/mtime 稳定判断、隐藏文件与 `.play.mp4` 过滤、周期对账。
- scanner 探测失败不入库且可重试，返回新增媒体 ID。
- 已有 Jimaku 映射自动取得、去重串行队列、持久失败状态和媒体库四种展示。

仍未覆盖下载意图状态机：`waiting → downloading → scanning → subtitle → ready/failed`。

### 真实验证

首版实际完成标准：

1. 详情页搜索一部已知作品并显示至少一个结构化结果。
2. magnet href 由合法 info hash 构造，本机已有默认处理器；不在验证中实际下载受版权保护的视频。
3. 本机下载器默认目录为 `~/AnimeLibrary`，且仍由用户在添加窗口最终确认。
4. 下载完成后稳定文件自动走现有 scanner 与 jimaku；手动扫描保留为恢复入口。
5. Nyaa 或下载器不可用时，官方详情、本地媒体库与学习功能仍可使用。

## 10. 参考

- 用户提供的原始流程截图：番剧下载使用 `nyaa.si`，日语字幕使用 `jimaku.cc`。
- dudulu 历史说明：追番列表提供 BT 种子，但不提供种子搜索：<https://www.v2ex.com/t/397847>
- qBittorrent WebUI API：<https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-%28qBittorrent-4.1%29>
- qBittorrent 下载目录选项：<https://github.com/qbittorrent/qBittorrent/wiki/Explanation-of-Options-in-qBittorrent>
- 浏览器目录授权限制：<https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker>
