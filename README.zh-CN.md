# ことばアニメ / Kotoba Anime

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**一个本地优先的日语动画学习播放器。** 先发现想看的作品，再用自己的本地媒体观看；默认隐藏字幕，听不懂时暂停，查看当前句、分词查词、按需获取 AI 讲解，并保存到生词本复习。

Kotoba Anime 是一个仍在早期阶段、自行部署在本机的 Web 应用。媒体文件始终留在你的电脑中；本应用不会托管、代理或下载视频。

## 可以做什么

- 浏览本季和上季动画，搜索作品，并打开官方播放或资讯链接。
- 用本地 `.mp4` / `.mkv` 文件和日语 `.srt` / `.ass` 字幕学习。浏览器播放需要时会对 MKV 重新封装。
- 默认保持听力模式：暂停时显示当前句、重听、逐句跳转，或打开会跟随播放位置的字幕列表。
- 在本地用 Kuromoji 分词，并用 JMdict 查询词义。
- 仅在你主动请求时，让 Anthropic、DeepSeek、OpenAI 或 Google Gemini 生成结构化讲解；结果只缓存在本机。
- 收藏单词和句子，并导出兼容 Anki 的 TSV 文件。
- 可选地连接 Jimaku 匹配字幕，或把 magnet 链接交给你自己的本地下载器。应用不包含下载器 RPC、视频传输或远程媒体管理。

## 快速开始（macOS）

**已验证环境：** macOS、Node.js 22+ 和 FFmpeg。Linux 可能可以运行，但目前不是受支持的发布目标。

```bash
git clone https://github.com/DanielDcool/animeprogram.git
cd animeprogram
brew install ffmpeg
npm ci
npm start
```

打开 [http://localhost:5173](http://localhost:5173)。应用会自动创建本地数据库，并默认监视 `~/AnimeLibrary`。

如需使用其他媒体或数据位置，请在启动前设置：

```bash
export MEDIA_DIR="$HOME/Movies/KotobaAnime"
export DATA_DIR="$PWD/.local-data"
npm start
```

## 可选配置

### 日语词典

如需本地单词释义，请从 [JMdict Simplified](https://github.com/scriptin/jmdict-simplified/releases) 下载 `jmdict-eng-*.json.zip`，解压到 `server/vendor/jmdict-eng.json`，再运行：

```bash
npm run import-jmdict -w server
```

### AI 讲解

在 **設定 / Settings** 中选择 Anthropic、DeepSeek、OpenAI 或 Google Gemini，并输入该服务的 API key。密钥和讲解缓存只储存在本机 SQLite 数据库；请勿提交密钥或 `server/data/` 目录。

OpenAI 需要 [OpenAI Platform API key](https://platform.openai.com/api-keys)；仅有 ChatGPT 或 Codex 订阅并不能充当 API key。

### 字幕与本地媒体

将媒体和匹配的日语字幕放入 `MEDIA_DIR`（默认 `~/AnimeLibrary`）。例如：

```text
~/AnimeLibrary/Show - 01.mkv
~/AnimeLibrary/Show - 01.ja.srt
```

优先使用外部日语字幕；否则应用会尝试从 MKV 提取内嵌日语字幕。Jimaku 匹配为可选功能，需要你自行取得并在设置页填写 API key。

## 学习快捷键

屏幕上的控制按钮可点击，键盘快捷键也可使用。

| 按键 | 操作 |
| --- | --- |
| `Space` | 暂停并显示当前句 / 继续播放并隐藏字幕 |
| `A` | 重听当前句；快速连按两次回到上一句 |
| `←` / `→` | 上一句 / 下一句 |
| `D` | 请求 AI 讲解当前选中的学习句 |
| `S` | 切换始终显示字幕 |
| `T` | 切换解析面板和字幕列表；字幕列表会定位当前句 |
| `[` / `]` | 字幕时间向前 / 向后调整 100ms |

桌面端可拖动播放器与解析面板之间的分隔线调整宽度。请使用应用内全屏按钮，以便在全屏时仍显示字幕。

重听时，右侧解析会保留当前选中的学习句，即使字幕处于隐藏状态也不会消失；只有暂停在另一句或在字幕列表中选择另一句时，解析才会切换。

## 开发

```bash
npm test
npm run build -w web
```

项目由 `server/` 中的 Fastify 服务端和 `web/` 中的 React/Vite 客户端组成。所有浏览器请求都经过 `web/src/api.ts`；学习模式状态位于 `web/src/player/learningMode.ts`。

## 使用 AI 编程助手进行本地配置

`AGENTS.md` 已逐渐成为跨工具通用的项目协作说明格式。本仓库根目录提供了 `AGENTS.md`，并另有面向 AI 助手的、按命令列出的安全配置指南：

1. 要求助手先阅读 [AGENTS.md](AGENTS.md)、本 README 和 [docs/AI-SETUP.md](docs/AI-SETUP.md)。
2. 然后告诉它：“请在本地配置 Kotoba Anime。除非我提出要求，否则不要暴露 API key、修改我的媒体文件或提交改动。”

这份指南明确区分了可选组件、个人本地数据、验证步骤以及必须先征得确认的操作。

## 参与贡献

欢迎贡献。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 和 [SECURITY.md](SECURITY.md)。请让每项改动都直接减少真实的学习摩擦，而不是增加泛化的平台功能。

## 媒体、隐私与法律边界

- 只使用你拥有或获授权使用的媒体与字幕。
- 媒体始终存放在 `MEDIA_DIR`；应用不会上传媒体。
- 可选的资源搜索只返回公开元数据，并把 magnet 链接交给你的本地下载器；它不会下载、托管或代理视频。
- API key、观看进度、生词、映射关系和 AI 讲解缓存均为本地应用数据；请有意识地备份或删除 SQLite 数据目录。
- 服务端默认只监听 `127.0.0.1`。不要把它暴露到不可信网络；API key 当前以明文保存于本地 SQLite 数据库。报告漏洞和了解威胁边界，请参阅 [SECURITY.md](SECURITY.md)。

## 许可证

Kotoba Anime 采用 [MIT License](LICENSE) 发布。

## 项目状态

项目已公开，并配置了 CI、贡献与安全策略。当前仅在 macOS 上完成验证；Linux 和 Windows 尚不是受支持的发布目标。在大范围推广前，仍需要一张无版权风险的截图或一段短演示。当前路线图见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
