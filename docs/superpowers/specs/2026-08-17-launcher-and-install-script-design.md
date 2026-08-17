# 双击启动器 + 一条命令安装脚本 设计

> 状态：已确认（2026-08-17，用户对四个范围决定全部选择推荐项：源码走 tarball 不依赖 git、
> Mac 无 Homebrew 时下载 ffmpeg.org 官网链接的静态包、安装时顺手装 JMdict、启动器与安装结束自动打开）。
> 背景：已有真实用户卡在安装；awesome-japanese 维护者也指出同类播放器对非技术用户不友好。
> 优先级见 `docs/DEVELOPMENT.md` §6.4。桌面应用（Tauri/Electron）明确不在本次范围内，等真实反馈再定。

## 目标

1. **双击启动器**：装好之后，每天启动不再需要「开终端 → cd → npm start」。
   macOS 双击 `tanku Anime.command`、Windows 双击 `tanku Anime.bat`，就绪后自动打开浏览器。
2. **一条命令安装**：没有 git、没有 Node、没有 FFmpeg、没有 Homebrew 的电脑，
   在终端里粘贴一行命令就能装好并启动一次。再次运行同一条命令 = 更新。

## 非目标

- 不做桌面应用、不做安装包（.dmg / .msi）、不签名。
- 不 sudo、不改系统 PATH、不改用户 shell 配置文件、不动用户已装的其他版本 Node。
- 不做应用内「检查更新」。更新就是再跑一次安装命令。
- 不替代 `git clone && npm ci && npm start`：技术用户原有路径完全不变。

## 设计 1：双击启动器（仓库根目录）

两个文件都只做同一件事：进入自己所在目录 → 让 `.tools/` 里的 Node/FFmpeg（若存在）
排在 PATH 最前 → 确认 Node 主版本是 22 → 设 `TANKU_OPEN_BROWSER=1` → `npm start`
→ 进程结束后停住窗口，让报错可见。

- `tanku Anime.command`（bash）：`cd "$(dirname "$0")"`；追加 `/opt/homebrew/bin:/usr/local/bin`
  到 PATH 兜底（Finder 启动的 Terminal 通常已是登录 shell，但不赖它）；找不到 Node 22 时打印
  「先运行安装命令」的提示；结尾 `read -r -p 'Press Enter to close'`。
- `tanku Anime.bat`（cmd）：`cd /d "%~dp0"`；同样的 PATH 前置与版本检查；结尾 `pause`。
  `.gitattributes` 固定 `*.bat` 为 CRLF、`*.command`/`*.sh` 为 LF，避免 Windows 上
  `core.autocrlf` 造成 bash 脚本带 `\r`。
- 文件名带空格是刻意的：这是用户在 Finder / 资源管理器里看到的名字，要像一个应用。
  脚本内部对 `%~dp0` / `$0` 全部加引号。

### `start.mjs` 自动打开浏览器

- 只在 `TANKU_OPEN_BROWSER=1` 时启用；默认 `npm start`、`verify:start`、CI 行为不变。
- 逻辑放在新文件 `scripts/browser.mjs`（纯 Node，无依赖，同 `precheck.mjs` 风格，
  配 `browser.d.mts`）：
  - `resolveWebUrl(env)`：`http://localhost:${WEB_PORT ?? 5173}/`。
  - `browserOpenCommand(platform, url)`：darwin → `open url`；win32 → `cmd /c start "" url`；
    其他 → `xdg-open url`。纯函数，可测。
  - `waitForHttpOk(url, { timeoutMs, intervalMs, fetchImpl })`：轮询直到任一 2xx/3xx/4xx
    响应（Vite 就绪即算），超时返回 false。注入 fetch，可测。
- `start.mjs`：spawn 完 server/web 后，若开关打开，`waitForHttpOk` 成功就 spawn 打开命令
  （`detached`、`stdio: 'ignore'`、`unref`）；失败只打印一行警告，不影响服务。
- 测试：`server/test/browser.test.ts` 覆盖 URL 解析、三平台命令、轮询成功/超时。

## 设计 2：安装脚本

两份脚本行为对齐：`scripts/install.sh`（macOS / Linux，bash）与 `scripts/install.ps1`（Windows PowerShell 5.1+）。
README 给出的入口：

```bash
curl -fsSL https://raw.githubusercontent.com/DanielDcool/tankuanime/master/scripts/install.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/DanielDcool/tankuanime/master/scripts/install.ps1 | iex
```

### 布局

安装目录默认 `~/tankuanime`（Windows：`%USERPROFILE%\tankuanime`），可用 `TANKU_INSTALL_DIR` 覆盖。
应用私有工具放在安装目录内的 `.tools/`（已在 `.gitignore`），删掉整个目录就是完整卸载：

```
~/tankuanime/
  .tools/node/      官方 Node 22 解压（macOS/Linux: bin/node bin/npm；Windows: node.exe npm.cmd）
  .tools/ffmpeg/    ffmpeg + ffprobe（macOS: evermeet.cx 静态包；Windows: gyan.dev essentials 的 bin/）
  server/data/      用户数据库（含 API key），更新时不动
  server/vendor/    JMdict，更新时不动
  tanku Anime.command / tanku Anime.bat
```

### 步骤（两平台一致，失败在哪一步就明说缺什么、怎么办）

1. **取源码**：下载 `https://github.com/DanielDcool/tankuanime/archive/refs/heads/<ref>.tar.gz`
   （Windows 用 `.zip`），去掉顶层 `tankuanime-<ref>/` 解压到安装目录。`TANKU_REF` 默认 `master`
   （CI 与本地验证时传具体 commit）。若安装目录已经是 git 仓库（`.git` 存在）则改为
   `git pull --ff-only`，不覆盖开发者自己 clone 的目录；pull 失败只警告并继续。
   解压前记录 `package-lock.json` 的哈希，用来决定第 4 步能否跳过。
2. **Node 22**：`node --version` 主版本已是 22 → 直接用。否则从
   `https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt` 解析当前平台/架构的文件名，下载官方
   压缩包并核对 SHA-256，解压到 `.tools/node/`。**不使用 fnm**：直接下载官方包同样绕开
   「LTS 别名装成 24」的坑，且不需要 shell 集成、不改用户任何配置、不影响已装的其他版本 Node。
   `.tools/node` 已存在且是 22 时跳过下载。
3. **FFmpeg**：`ffmpeg -version` 与 `ffprobe -version` 都能跑 → 直接用。否则：
   - macOS：Homebrew 存在则 `brew install ffmpeg`；不存在则下载 ffmpeg.org 官网 macOS 栏目
     唯一链接的 evermeet.cx 静态包（`getrelease/zip` 与 `getrelease/ffprobe/zip`）到 `.tools/ffmpeg/`。
     该构建只有 x86_64；Apple Silicon 上依赖 Rosetta 2。脚本先用 `arch -x86_64 /usr/bin/true`
     探测，缺失时尝试 `softwareupdate --install-rosetta --agree-to-license`，失败则打印
     这条命令请用户自行执行后重跑。
   - Windows：下载 ffmpeg.org 官网链接的 gyan.dev `ffmpeg-release-essentials.zip`，
     只取 `bin/ffmpeg.exe` 与 `bin/ffprobe.exe` 到 `.tools/ffmpeg/`。不走 winget：
     避免依赖 winget 存在、UAC 弹窗与系统 PATH 修改。
   - Linux：不下载，提示用发行版包管理器安装后重跑（Linux 用户默认有能力处理）。
4. **依赖**：用第 2 步得到的 Node 跑 `npm ci`。若 `package-lock.json` 哈希与解压前相同且
   `node_modules` 存在则跳过，让「重跑即更新」在无依赖变化时只花几秒。
5. **词典**：`npm run setup:jmdict`。失败只打印手动指引，不阻断。
6. **快捷方式**：macOS 在 `~/Desktop` 建指向 `tanku Anime.command` 的符号链接；
   Windows 用 `WScript.Shell` 在桌面（`[Environment]::GetFolderPath('Desktop')`，兼容 OneDrive
   重定向）建 `tanku Anime.lnk`，工作目录设为安装目录。桌面不存在则跳过。
7. **启动一次**：macOS `open "tanku Anime.command"`（新 Terminal 窗口）；Windows
   `Start-Process` 该 `.bat`（新 cmd 窗口）。安装用的终端随即结束，应用在自己的窗口里运行并
   自动打开浏览器——这同时是对启动器的一次真实验证。`TANKU_NO_LAUNCH=1` 关闭（CI 用）。

### 约束

- 幂等：任何一步已满足就跳过；重跑不会破坏 `server/data`、`server/vendor`、`.tools`。
- 所有下载：先写临时文件、成功后再移动到位；Node 包核对官方 SHA-256。
- 全程不需要管理员权限（Rosetta 安装是唯一可能要密码的分支，且只在无 Homebrew 的
  Apple Silicon 上触发，失败有兜底提示）。
- 脚本自身用 `curl | bash` / `irm | iex` 方式运行时没有可交互的 stdin，因此不设任何交互提问；
  可调参数只走环境变量（`TANKU_INSTALL_DIR`、`TANKU_REF`、`TANKU_NO_LAUNCH`、`TANKU_SKIP_JMDICT`——最后一个供 CI 省时间）。
- 不打印任何凭证；`server/data` 内容从不读取。

## 验证

- 单测：`server/test/browser.test.ts`（纯函数）；`npm test` 全绿。
- `npm run verify:start` 不受影响（未设开关）。
- 本机 macOS：`bash -n` + shellcheck（若可用）；用临时 `HOME` 与临时 `TANKU_INSTALL_DIR`
  真跑 `install.sh`，覆盖「PATH 里没有 node」分支（真实下载官方 Node 22）与「没有 ffmpeg」分支
  （真实下载静态包）；再用 `open` 打开生成的 `.command` 走一次 Finder 双击路径，确认浏览器被打开
  且服务在新窗口里起来。验证全程不播放媒体。
- CI：`ci.yml` 增加 `install-smoke` job（`macos-latest`、`windows-latest`），
  以 `TANKU_REF=${{ github.sha }}`、`TANKU_NO_LAUNCH=1`、临时安装目录真跑对应脚本，
  然后用安装目录里的 Node 跑 `npm run verify:start`。Windows 本地没有实机，`.ps1` 与 `.bat`
  的正确性依赖这个 job；`.bat` 的双击行为与 `.lnk` 只能等真实用户/维护者在 Windows 上确认，
  文档中要写明这个边界。

## 文档

- 三语 README「Quick start」最前面加安装一行命令 + 「以后双击启动」；原有手动步骤保留在其后。
- `docs/DEVELOPMENT.md` §3 功能表、§4 决策（为什么 tarball / 为什么不用 fnm、winget / 为什么
  应用私有 `.tools`）、§6.4 状态更新；`CHANGELOG.md` Unreleased。
