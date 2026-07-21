# 日语学习动画播放器 — 设计文档（MVP）

日期：2026-07-21
状态：已确认（用户批准，实际使用后迭代调整）

## 1. 背景与定位

为"无阻沉浸"式日语学习定制的看番播放器。现有工具（asbplayer、Voracious、Memento、Language Reactor）各有一块能力，但没有产品同时具备：

1. 番剧搜索下载（nyaa.si）
2. 日语字幕自动匹配（jimaku.cc API）
3. 默认隐藏字幕 + 按键暂停显示 + 回看本句
4. 右侧面板对当前句做分词、查词、AI 语法讲解

本项目把这四件事整合为一个自用的本地 Web 应用。

**MVP 范围（第一版）**：仅第 3、4 项——播放器 + 学习模式 + 分析面板。视频与字幕文件手动放入媒体库文件夹。
**第二版及以后**：jimaku 字幕自动匹配 → nyaa 搜索下载 → 生词本/Anki 导出。

## 2. 技术选型

| 项 | 选择 | 理由 |
|----|------|------|
| 形态 | 本地 Web 应用（本地起服务，浏览器打开） | 开发最快、UI 灵活、跨平台，未来可挂局域网 |
| 后端 | Node.js + TypeScript + Fastify | torrent/字幕/日语 NLP 的现成轮子几乎全在 JS 生态 |
| 前端 | React + TypeScript + Vite | 生态成熟，播放页交互复杂度适中 |
| 数据库 | SQLite（better-sqlite3） | 单人本地应用，零运维 |
| 分词 | kuromoji.js（含变形还原到辞书形） | 纯 JS、离线、毫秒级 |
| 词典 | JMdict（jmdict-simplified JSON 导入 SQLite） | 免费、覆盖全 |
| AI 讲解 | Claude API（模型可配置） | 句子级语法/惯用/语境分析 |
| 视频处理 | ffmpeg（本机安装，child_process 调用） | remux mkv→mp4、抽取内嵌字幕、探测编码 |

启动方式：`npm start` 同时起后端与前端，自动打开浏览器。

## 3. 核心工作流（学习模式）

状态机：

```
播放中（字幕隐藏） --Space--> 暂停（显示当前句字幕，右侧面板立即出本地分析）
暂停 --Space--> 继续播放（字幕重新隐藏）
任意状态 --A--> 跳回当前句开头并播放（重听，不显示字幕）
任意状态 --←/→--> 上一句/下一句开头
暂停 --D--> 调 Claude API 生成本句深度讲解（结果缓存）
任意状态 --S--> 切换"字幕常显"普通观看模式
```

要点：

- 暂停即分析：本地分词+查词毫秒级完成，右侧面板无需等待。
- AI 讲解仅按 `D` 触发，请求带前后各 2 句上下文；结果按（作品, 句子文本）缓存进 SQLite，重复观看零成本。
- 快捷键可在设置页重绑定。
- "暂停自动显示字幕"为默认行为；后续可加"暂停后再按一键才显示"的更严格模式（实际使用后决定）。

## 4. 系统架构

两进程本地应用：

```
浏览器（React SPA）
  ├─ 媒体库页：剧集列表、观看进度
  ├─ 播放页：<video> + 字幕覆盖层 + 右侧分析面板 + 快捷键
  └─ 设置页：API key、快捷键、字幕偏移
        │ HTTP (REST + Range streaming)
Node.js 后端（Fastify）
  ├─ media    ：媒体库扫描、ffmpeg remux/探测、Range 流式播放
  ├─ subtitle ：.srt/.ass 解析 → 统一 {start,end,text} 句子列表
  ├─ analyze  ：kuromoji 分词 + 变形还原 + JMdict 查词
  ├─ ai       ：Claude API 语法讲解 + SQLite 缓存
  └─ progress ：每集观看位置记录
        │
  SQLite + 媒体库文件夹（视频/字幕文件）
```

### 模块职责与接口

**media**
- 扫描配置的媒体库文件夹，识别视频文件（.mkv/.mp4），按文件名分组为"作品/集"。
- 导入时用 ffprobe 探测：H.264 + mkv → ffmpeg remux 成 mp4（秒级，不重编码），同时抽取内嵌字幕轨为 .ass/.srt 文件。
- H.265/10bit 等浏览器不支持的编码：标记为"需转码"，提示用户换源或触发慢速转码（MVP 只提示）。
- 提供 `GET /api/media`（列表）、`GET /api/media/:id/stream`（Range 流）。

**subtitle**
- 解析 .srt 与 .ass（ass 只取对白文本，去除特效标签），输出按开始时间排序的句子数组。
- `GET /api/media/:id/subtitles` 返回全集句子列表，前端据此做"当前句"判定与跳转。
- 支持每集保存字幕偏移量（±0.1s 精度），应用在返回的时间轴上。

**analyze**
- `POST /api/analyze { text }` → tokens：表层形、读音（假名）、词性、辞书形、JMdict 释义（英/可用时中）。
- kuromoji 词典与 JMdict 在服务启动时加载/建索引。

**ai**
- `POST /api/explain { mediaId, text, context[] }` → 结构化讲解：语法结构、句型/惯用表达、语气与语境、翻译。
- 缓存表 `explain_cache(media_id, sentence_hash, response)`，命中直接返回。
- 未配置 API key 或调用失败：返回明确错误码，前端降级为仅本地分析。

**progress**
- `PUT /api/media/:id/progress { position }`，媒体库页显示"看到第 n 集 mm:ss"。

### 前端播放页组件

- `VideoPlayer`：`<video>` 封装，暴露 seek/pause/play。
- `SubtitleOverlay`：根据学习模式状态决定是否渲染当前句。
- `AnalysisPanel`：句子原文（token 可点击高亮）→ 分词卡片列表 → 词典释义区 → AI 讲解区。
- `useLearningMode`：状态机 + 快捷键绑定（核心逻辑，独立 hook，纯逻辑可单测）。

## 5. 数据模型（SQLite）

```
media(id, series, episode, file_path, playable_path, codec_status, created_at)
subtitle_file(id, media_id, file_path, format, offset_ms)
progress(media_id, position_sec, updated_at)
explain_cache(id, media_id, sentence_hash, sentence_text, response_json, created_at)
settings(key, value)   -- API key、快捷键映射、媒体库路径等
```

## 6. 错误处理

| 场景 | 行为 |
|------|------|
| 视频编码不支持 | 媒体库中标记"需转码/建议换源"，不静默失败 |
| 无字幕文件 | 播放页提示，可普通播放；学习模式按钮禁用并说明原因 |
| 字幕时间轴偏移 | 播放页内 ±0.1s/±0.5s 微调快捷键，偏移量持久化 |
| Claude API 失败/未配置 | 面板显示本地分析 + 一条降级提示，不阻塞播放 |
| ffmpeg 未安装 | 启动时检测，给出安装指引 |

## 7. 测试策略

- 单元测试（vitest）：字幕解析（srt/ass 各种边界）、analyze 分词与变形还原、useLearningMode 状态机、explain 缓存命中逻辑。
- 集成测试：media 扫描 + remux 流程用小样本视频文件跑通。
- 端到端：浏览器手动 + 自动化冒烟（打开播放页 → Space 暂停出字幕 → 面板出分词）。
- TDD：纯逻辑模块先写测试再实现。

## 8. 第二版接口预留

- 下载模块产出的文件落入同一媒体库文件夹，复用 media 扫描管线。
- jimaku 下载的字幕文件走 subtitle_file 同一张表与解析管线。
- 生词本：AnalysisPanel 已有"收藏本句"位置，后续加 `vocab` 表与 Anki 导出（AnkiConnect）。
