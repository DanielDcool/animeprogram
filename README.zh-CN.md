# tanku Anime

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**一个本地优先的日语动画学习播放器。** 先发现想看的作品，再用自己的本地媒体观看；默认隐藏字幕，听不懂时暂停，查看当前句、分词查词、按需获取 AI 讲解，并保存到生词本复习。

tanku Anime 是一个仍在早期阶段、自行部署在本机的 Web 应用。媒体文件始终留在你的电脑中；本应用不会托管、代理或下载视频。

## 可以做什么

- 浏览本季和上季动画，搜索作品，并打开官方播放或资讯链接。
- 用本地 `.mp4` / `.mkv` 文件和日语 `.srt` / `.ass` 字幕学习。浏览器播放需要时会对 MKV 重新封装。
- 大型媒体库会按视频所在目录分组，不再把所有剧集混在一张长列表中；每个目录都可以单独折叠。
- 默认保持听力模式：暂停时显示当前句、重听、逐句跳转，或打开会跟随播放位置的字幕列表。
- 在本地用 Kuromoji 分词，并用 JMdict 查询词义。
- 仅在你主动请求时，让 Anthropic、DeepSeek、OpenAI 或 Google Gemini 生成结构化讲解；结果只缓存在本机。
- 收藏单词和句子，在详情页查看保存的释义、已有 AI 讲解缓存和带时间的来源链接，并导出兼容 Anki 的 TSV 文件。
- 可选地连接 Jimaku 匹配字幕，或把 magnet 链接交给你自己的本地下载器。应用不包含下载器 RPC、视频传输或远程媒体管理。

## 快速开始

**运行要求：** Node.js 22.x，以及已加入 `PATH` 的 `ffmpeg` 和 `ffprobe`。完整应用和真实媒体流程已在 macOS 手动验证。Windows CI 会检查依赖安装、测试、构建、启动、SQLite 初始化、目录监听、网页和健康接口；Windows 真实媒体播放仍需在实体电脑上最终确认。

macOS：

```bash
git clone https://github.com/DanielDcool/animeprogram.git
cd animeprogram
brew install ffmpeg
npm ci
npm start
```

Windows PowerShell（先安装 [Node.js 22](https://nodejs.org/en/download)，并从 [FFmpeg 官方下载页](https://ffmpeg.org/download.html)所列来源安装 Windows 版本）：

```powershell
node --version
ffmpeg -version
ffprobe -version
git clone https://github.com/DanielDcool/animeprogram.git
cd animeprogram
npm ci
npm start
```

`node --version` 必须显示 `v22.x`。不要直接使用会随时间变化的 Node.js “LTS”软件包别名，除非确认它仍然安装 22 大版本。

打开 [http://localhost:5173](http://localhost:5173)。应用会自动创建本地数据库，并默认监视用户主目录中的 `AnimeLibrary` 文件夹。你可以在**设置**页直接修改完整路径；保存后重启应用即可生效。

`MEDIA_DIR` 仍然是优先级最高的进程级覆盖项。macOS 或 Linux 如需临时覆盖媒体目录，或使用其他数据位置，请在启动前设置：

```bash
export MEDIA_DIR="$HOME/Movies/TankuAnime"
export DATA_DIR="$PWD/.local-data"
npm start
```

Windows PowerShell 请使用仅对当前进程生效的环境变量：

```powershell
$env:MEDIA_DIR = "$HOME\Videos\TankuAnime"
$env:DATA_DIR = "$PWD\.local-data"
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

将媒体和匹配的日语字幕放入**设置**页显示的媒体目录（默认是用户主目录中的 `AnimeLibrary` 文件夹）。你可以按作品建立子目录，媒体库会按相对目录分组。例如：

```text
AnimeLibrary/Show/Show - 01.mkv
AnimeLibrary/Show/Show - 01.ja.srt
```

优先使用外部日语字幕；否则应用会尝试从 MKV 提取内嵌日语字幕。Jimaku 匹配为可选功能，需要你自行取得并在设置页填写 API key。

magnet 按钮同样是可选功能，需要操作系统已注册支持 magnet 的桌面下载器。在 Windows 上，AI 只有得到用户确认后才能安装或修改下载器；如需自动进入媒体库，应把下载器保存目录设为**设置**页显示的媒体目录。为获得最广泛的浏览器兼容性，请优先选择 H.264 8-bit；Windows 的 HEVC 支持会受系统、硬件、扩展和浏览器影响，因此 tanku Anime 会保守地把 H.265 标记为可能需要转换。

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

重新打开视频时会从最后保存的观看位置继续。若从生词详情页的来源链接进入，则首次优先跳到该句保存的时间点。

## 开发

```bash
npm test
npm run build -w web
```

项目由 `server/` 中的 Fastify 服务端和 `web/` 中的 React/Vite 客户端组成。所有浏览器请求都经过 `web/src/api.ts`；学习模式状态位于 `web/src/player/learningMode.ts`。

## 使用 AI 编程助手进行本地配置

只需对 AI 编程助手说：

> 请从 https://github.com/DanielDcool/animeprogram 安装并启动 tanku Anime。

阅读 [AGENTS.md](AGENTS.md)、本 README 和 [docs/AI-SETUP.md](docs/AI-SETUP.md) 是 AI 的职责。这些文件已定义安全边界、平台检查、可选组件和验证步骤，用户不必逐条重复。在 Windows 上，AI 必须确认 Node.js 22、两个 FFmpeg 命令、依赖、测试、启动、网页和健康接口全部正常后，才能说安装成功。

## 参与贡献

欢迎贡献。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 和 [SECURITY.md](SECURITY.md)。请让每项改动都直接减少真实的学习摩擦，而不是增加泛化的平台功能。

## 媒体、隐私与法律边界

- 只使用你拥有或获授权使用的媒体与字幕。
- 媒体始终存放在配置好的本地媒体目录中；应用不会上传媒体。
- 可选的资源搜索只返回公开元数据，并把 magnet 链接交给你的本地下载器；它不会下载、托管或代理视频。
- API key、观看进度、生词、映射关系和 AI 讲解缓存均为本地应用数据；请有意识地备份或删除 SQLite 数据目录。
- 服务端默认只监听 `127.0.0.1`。不要把它暴露到不可信网络；API key 当前以明文保存于本地 SQLite 数据库。报告漏洞和了解威胁边界，请参阅 [SECURITY.md](SECURITY.md)。

## 许可证

tanku Anime 采用 [MIT License](LICENSE) 发布。

## 项目状态

项目已公开，并配置了跨平台 CI、贡献与安全策略。macOS 已完成完整手动验证；Windows 已加入兼容修复和自动化覆盖，但实体电脑上的真实媒体播放仍待确认。在大范围推广前，还需要一张无版权风险的截图或一段短演示。当前路线图见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
