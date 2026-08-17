# tanku Anime

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**一个本地优先的日语学习播放器，覆盖动画与日剧。** 先发现想看的作品，再用自己的本地媒体观看；默认隐藏字幕，听不懂时暂停，查看当前句、分词查词、按需获取 AI 讲解，并保存到生词本复习。

## 安装

一条命令。事先不需要 git、Node.js 或 FFmpeg。

macOS：打开「终端」（`⌘ + 空格`，输入 `终端`），粘贴：

```bash
curl -fsSL https://raw.githubusercontent.com/DanielDcool/tankuanime/master/scripts/install.sh | bash
```

Windows：打开 PowerShell（按 `⊞ Win` 键，输入 `PowerShell`），粘贴：

```powershell
irm https://raw.githubusercontent.com/DanielDcool/tankuanime/master/scripts/install.ps1 | iex
```

跑完应用会自动启动并打开浏览器。之后每次使用，**双击桌面上的 tanku Anime 快捷方式**即可。再运行一次同样的命令就是更新。想用 git？见[手动安装](#手动安装)。

<details>
<summary>安装脚本具体做了什么</summary>

- 安装到 `~/tankuanime`，下载的所有东西都放在这个文件夹里：源码、一份应用私有的 Node.js 22（nodejs.org 官方构建，SHA-256 校验）、FFmpeg。不需要管理员权限，不改系统 `PATH`，也不改 shell 配置。如果 `PATH` 里已有 Node.js 22 或 FFmpeg，会直接沿用。
- FFmpeg 来自 ffmpeg.org 官网链接的构建：macOS 没装 Homebrew 时用 [evermeet.cx](https://evermeet.cx/ffmpeg/) 的静态包（Intel 二进制，Apple Silicon 上经 Rosetta 2 运行）；Windows 用 [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) 的 essentials 构建。
- 顺手下载日语词典（JMdict）、执行 `npm ci`，并在桌面放一个 **tanku Anime** 快捷方式。卸载 = 删除文件夹和快捷方式。
- Windows：安装脚本和启动器每次推送都在 CI 上实跑，但还没在实体 Windows 机器上试过——欢迎反馈。

</details>

![tanku Anime 播放器：暂停在没听懂的那一句，右侧显示分词、词典和 AI 讲解](docs/images/player.png)

*暂停在没听懂的那一句。当前句被分词，点击的词显示读音和 JMdict 释义，需要时再让 AI 给出翻译、语法结构、表现和语气。*

| 找想看的作品 | 复习保存下来的 |
| --- | --- |
| ![发现页：本季新番](docs/images/discover.png) | ![生词本：已保存的词和句子](docs/images/vocab.png) |

*截图使用项目自带的演示媒体，不含受版权保护的视频。*

tanku Anime 是一个仍在早期阶段、自行部署在本机的 Web 应用。媒体文件始终留在你的电脑中；本应用不会托管、代理或下载视频。

## 可以做什么

- 发现动画与日剧：浏览本季和上季动画、查看随应用附带的日剧精选、搜索作品，并打开官方播放或资讯链接。
- 在顶部导航切换 **アニメ**（动画）和 **ドラマ**（日剧）两个模式。整站配色随模式反转：动画是墨黑底米白字，日剧正好相反；播放页在两个模式下都保持墨黑，让解析面板始终是画面旁唯一的大面积亮色。
- 日剧不需要任何配置就能上手：应用内置按听力难度分级的手写精选日剧，每部都写清楚它适合学什么，例如职场敬语或日常会话。
- 清单以外的日剧直接按剧名搜索（日文或罗马字）：结果是带海报、评分、集数、电视台和简介的作品卡片，数据来自 Bangumi，不需要 token。目录里没有时，卡片下方的 **もっと探す** 按钮会用同一个关键词直接搜 Nyaa。
- 用本地 `.mp4` / `.mkv` 文件和日语 `.srt` / `.ass` 字幕学习。浏览器播放需要时会对 MKV 重新封装。
- 大型媒体库会按视频所在目录分组，不再把所有剧集混在一张长列表中；每个目录都可以单独折叠。
- 播放页会列出同一目录内的可播放视频，并提供上一话、下一话和直接选集。
- 默认保持听力模式：暂停时显示当前句、重听、逐句跳转，或打开会跟随播放位置的字幕列表。
- 在本地用 Kuromoji 分词，并用 JMdict 查询词义。
- 仅在你主动请求时，让 Anthropic、DeepSeek、OpenAI 或 Google Gemini 生成结构化讲解；结果只缓存在本机。
- 收藏单词和句子，在详情页查看释义、已有 AI 讲解缓存和带时间的来源链接，再一键发送到名为 `tanku Anime` 的 Anki 牌组；已添加的卡片会自动跳过。
- 可选地连接 Jimaku 匹配字幕，或把 magnet 链接交给你自己的本地下载器。Jimaku 会同时搜索动画和真人剧字幕库，日剧字幕走的是同一套「人工匹配一次」的流程；日剧资源搜索使用 Nyaa 的 Live Action 分类，默认取 raw 发布。应用不包含下载器 RPC、视频传输或远程媒体管理。

## 手动安装

面向开发者，或者你更想用自己的 git 检出、Node.js 和 FFmpeg。

**运行要求：** Node.js 22.x，以及已加入 `PATH` 的 `ffmpeg` 和 `ffprobe`。macOS 已用真实媒体完整验证；Windows 的安装与启动已验证，实体机上的媒体播放尚未确认。

macOS：

```bash
git clone https://github.com/DanielDcool/tankuanime.git
cd tankuanime
brew install ffmpeg
npm ci
npm start
```

Windows PowerShell（先安装 [Node.js 22](https://nodejs.org/en/download)，并从 [FFmpeg 官方下载页](https://ffmpeg.org/download.html)所列来源安装 Windows 版本）：

```powershell
node --version
ffmpeg -version
ffprobe -version
git clone https://github.com/DanielDcool/tankuanime.git
cd tankuanime
npm ci
npm start
```

`node --version` 必须显示 `v22.x`。不要直接使用会随时间变化的 Node.js “LTS”软件包别名，除非确认它仍然安装 22 大版本。

`npm start` 启动前会先做环境预检：Node.js 大版本不是 22 时会直接停止并给出安装指引；`PATH` 中缺少 `ffmpeg` 或 `ffprobe` 时会打印警告，但仍会启动。设置 `TANKU_OPEN_BROWSER=1` 可以让它在页面就绪后自动打开浏览器——双击启动器就是这么做的。

## 首次运行

打开 [http://localhost:5173](http://localhost:5173)。应用会自动创建本地数据库，并默认监视用户主目录中的 `AnimeLibrary` 文件夹。你可以在**设置**页直接修改完整路径；保存后重启应用即可生效。

媒体库为空时，页面会直接引导你设置媒体目录、放入第一段视频和可选字幕。仅播放本地视频不需要任何 API key；AI 讲解和 Jimaku 都可以稍后再配置。

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

如需本地单词释义，运行（一行安装脚本已经做过这一步）：

```bash
npm run setup:jmdict
```

该命令会自动下载已验证的 [JMdict Simplified](https://github.com/scriptin/jmdict-simplified) 版本（CC BY-SA 4.0，JMdict 版权归 [EDRDG](https://www.edrdg.org/) 所有），解压并导入本地数据库。加 `-- --latest` 使用最新版本，加 `-- --force` 强制重新下载。

如果自动下载不可用，可从 [JMdict Simplified releases](https://github.com/scriptin/jmdict-simplified/releases) 手动下载 `jmdict-eng-*.json.zip`，解压到 `server/vendor/jmdict-eng.json`，再运行 `npm run import-jmdict -w server`。

### 一键导出到 Anki

在 Anki 中使用插件代码 `2055492159` 安装 [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect)，重启 Anki，并在导出时保持 Anki 运行。进入生词页点击 **Anki に一括追加**，tanku Anime 会自动创建同名牌组和卡片类型，只添加新卡片，并在背面保留例句、出处和带时间的本地播放链接。

应用只连接本机 `127.0.0.1:8765` 的 AnkiConnect，不会直接修改 Anki 数据库。Anki 或插件不可用时，本地生词不会受影响，页面会显示所需设置。

新导出的卡片使用 `APP_BASE_URL`（默认 `http://localhost:5173`）生成播放回链。已经导出且因去重被跳过的旧卡片不会被自动改写。

### AI 讲解

在 **設定 / Settings** 中选择 Anthropic、DeepSeek、OpenAI 或 Google Gemini，并输入该服务的 API key。密钥和讲解缓存只储存在本机 SQLite 数据库；请勿提交密钥或 `server/data/` 目录。

讲解语言支持中文和英文。默认跟随浏览器 / 系统语言（`zh-*` 为中文，其余为英文）；也可以在设置页的 **AI 解説の言語** 中固定为其中一种。

OpenAI 需要 [OpenAI Platform API key](https://platform.openai.com/api-keys)；仅有 ChatGPT 或 Codex 订阅并不能充当 API key。

### 日剧搜索（Bangumi）

日剧模式完全不需要 token。首页是内置精选清单；搜索框会到 [Bangumi 番组计划](https://bgm.tv/)（`api.bgm.tv`，公开、免 key）查剧名，只显示日本电视剧——电影、综艺和非日本剧集会被过滤掉。Bangumi 是社区维护的数据库：冷门或很老的剧可能缺，部分简介是中文而非日文。目录里找不到的，用结果下方的 **もっと探す（Nyaa で直接検索）** 按钮按关键词直接搜 Nyaa。

### 字幕与本地媒体

将媒体和匹配的日语字幕放入**设置**页显示的媒体目录（默认是用户主目录中的 `AnimeLibrary` 文件夹）。你可以按作品建立子目录，媒体库会按相对目录分组。例如：

```text
AnimeLibrary/Show/Show - 01.mkv
AnimeLibrary/Show/Show - 01.ja.srt
```

优先使用外部日语字幕；否则应用会尝试从 MKV 提取内嵌日语字幕。Jimaku 匹配为可选功能，需要你自行取得并在设置页填写 API key。

magnet 按钮同样是可选功能，需要操作系统已注册支持 magnet 的桌面下载器。在 Windows 上，AI 只有得到用户确认后才能安装或修改下载器；如需自动进入媒体库，应把下载器保存目录设为**设置**页显示的媒体目录。为获得最广泛的浏览器兼容性，请优先选择 H.264 8-bit；Windows 的 HEVC 支持会受系统、硬件、扩展和浏览器影响，因此 tanku Anime 会保守地把 H.265 标记为可能需要转换。

#### 资源搜索只显示「Nyaa で検索」链接

候选列表是由本机的服务进程去抓 nyaa.si 的，不是浏览器；而 Node.js 不会使用系统代理。如果你的网络需要代理才能访问 nyaa.si（或 AniList / Jimaku），要么打开代理软件的 TUN / 增强模式，要么用 Node 内置的代理支持启动（需要 Node 22.21 及以上；端口改成你代理的端口）：

```bash
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 npm start
```

PowerShell：`$env:NODE_USE_ENV_PROXY = "1"; $env:HTTPS_PROXY = "http://127.0.0.1:7890"; npm start`

如何区分两种情况：错误卡片的详情类似 `fetch failed (ENOTFOUND)` 或超时，说明服务端连不上 nyaa.si（运行 `npm start` 的终端也会打印同样的原因）；如果页面显示的是「候補が見つかりませんでした」，说明网络正常，只是这部作品在当前分类下没有资源——切到「字幕なし」或「すべて」再试。

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

屏幕上只保留常用学习控制；`[` / `]` 是不常用的高级快捷键。桌面端可拖动播放器与解析面板之间的分隔线调整宽度。请使用应用内全屏按钮，以便在全屏时仍显示字幕。

“始终显示字幕”的开关会保存在当前浏览器中；刷新页面、离开后返回或切换剧集时，都会保持上一次选择。

重听时，右侧解析会保留当前选中的学习句，即使字幕处于隐藏状态也不会消失；只有暂停在另一句或在字幕列表中选择另一句时，解析才会切换。

重新打开视频时会从最后保存的观看位置继续。若从生词详情页的来源链接进入，则首次优先跳到该句保存的时间点。

## 开发

```bash
npm test
npm run build -w web
```

项目由 `server/` 中的 Fastify 服务端和 `web/` 中的 React/Vite 客户端组成。所有浏览器请求都经过 `web/src/api.ts`；学习模式状态位于 `web/src/player/learningMode.ts`。

### 进阶：将网页端放到服务器

推荐把网页端和 API 放在同一个域名下，由反向代理把 `/api` 转到仅监听本机的 Fastify；同源请求不需要额外开放 CORS。若网页端和 API 必须使用不同域名，构建网页端时用 `VITE_API_BASE_URL` 指向 API，用逗号分隔的 `CORS_ORIGINS` 精确列出可信网页来源，并设置 `APP_BASE_URL` 生成正确的 Anki 回链。这些配置不会提供登录、HTTPS 或多用户数据隔离；在补齐这些能力前，不要把 API 直接暴露到公网。

## 使用 AI 编程助手进行本地配置

只需对 AI 编程助手说：

> 请从 https://github.com/DanielDcool/tankuanime 安装并启动 tanku Anime。

阅读 [AGENTS.md](AGENTS.md)、本 README 和 [docs/AI-SETUP.md](docs/AI-SETUP.md) 是 AI 的职责。这些文件已定义安全边界、平台检查、可选组件和验证步骤，用户不必逐条重复。在 Windows 上，AI 必须确认 Node.js 22、两个 FFmpeg 命令、依赖、测试、启动、网页和健康接口全部正常后，才能说安装成功。

## 参与贡献

欢迎贡献。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 和 [SECURITY.md](SECURITY.md)。请让每项改动都直接减少真实的学习摩擦，而不是增加泛化的平台功能。

## 媒体、隐私与法律边界

- 只使用你拥有或获授权使用的媒体与字幕。
- 媒体始终存放在配置好的本地媒体目录中；应用不会上传媒体。
- 可选的资源搜索只返回公开元数据，并把 magnet 链接交给你的本地下载器；它不会下载、托管或代理视频。
- 日剧搜索结果与作品信息来自 [Bangumi 番组计划](https://bgm.tv/) 的公开 API；海报图片从 Bangumi 与 TMDB 的 CDN 直接加载，应用不保存图片。tanku Anime 与这两个服务均无隶属关系。
- API key、观看进度、生词、映射关系和 AI 讲解缓存均为本地应用数据；请有意识地备份或删除 SQLite 数据目录。
- 服务端默认只监听 `127.0.0.1`。不要把它暴露到不可信网络；API key 当前以明文保存于本地 SQLite 数据库。报告漏洞和了解威胁边界，请参阅 [SECURITY.md](SECURITY.md)。

## 许可证

tanku Anime 采用 [MIT License](LICENSE) 发布。

## 项目状态

仍处于早期阶段，但作者本人每天在用。完整学习闭环已在 macOS 用真实媒体验证；Windows 已有兼容修复、跨平台 CI 和全新安装启动实测，实体机上的媒体播放尚未确认。

日剧模式是最新加入的功能。内置精选清单、Bangumi 剧名搜索与详情页、日剧资源搜索、Jimaku 日剧字幕都已对真实服务确认可用。路线图见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
