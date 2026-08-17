# 双击启动器 + 一条命令安装脚本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让非技术用户「粘贴一行命令装好并启动」，之后「双击一个文件」就能用；技术用户原有 `git clone && npm ci && npm start` 路径不变。

**Architecture:** 根目录两个双击启动器只负责 PATH 前置 + Node 22 检查 + `TANKU_OPEN_BROWSER=1 npm start`；`start.mjs` 新增可选的「就绪后开浏览器」，逻辑在纯 Node 的 `scripts/browser.mjs`；`scripts/install.sh` / `install.ps1` 把源码 tarball、官方 Node 22、ffmpeg.org 官网链接的 FFmpeg 构建全部装进安装目录私有的 `.tools/`，不 sudo、不改系统 PATH 与 shell 配置。

**Tech Stack:** bash（macOS/Linux）、PowerShell 5.1+（Windows）、cmd batch、Node 22 ESM 脚本、vitest（server 测试）、GitHub Actions。

设计见 `docs/superpowers/specs/2026-08-17-launcher-and-install-script-design.md`。
仓库约定：只有用户明确要求时才提交，因此本计划各任务不含 commit 步骤；全部完成后由用户决定。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `scripts/browser.mjs`（新增）+ `scripts/browser.d.mts` | `resolveWebUrl` / `browserOpenCommand` / `waitForHttpOk` 纯函数 |
| `server/test/browser.test.ts`（新增） | 上述纯函数单测 |
| `scripts/start.mjs` | 读取 `TANKU_OPEN_BROWSER`，就绪后开浏览器 |
| `tanku Anime.command`、`tanku Anime.bat`（新增，根目录） | 双击启动器 |
| `.gitattributes`（新增） | `.bat` CRLF、`.command`/`.sh` LF |
| `scripts/install.sh`、`scripts/install.ps1`（新增） | 安装脚本 |
| `.github/workflows/ci.yml` | `install-smoke` job |
| `README.md`、`README.zh-CN.md`、`README.ja.md`、`docs/DEVELOPMENT.md`、`CHANGELOG.md` | 文档 |

---

### Task 1: `scripts/browser.mjs` 纯函数（TDD）

**Files:** Create `scripts/browser.mjs`、`scripts/browser.d.mts`、`server/test/browser.test.ts`

- [x] 写失败测试 `server/test/browser.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { browserOpenCommand, resolveWebUrl, waitForHttpOk } from '../../scripts/browser.mjs';

describe('resolveWebUrl', () => {
  it('defaults to 5173', () => expect(resolveWebUrl({})).toBe('http://localhost:5173/'));
  it('honours WEB_PORT', () => expect(resolveWebUrl({ WEB_PORT: '4321' })).toBe('http://localhost:4321/'));
});

describe('browserOpenCommand', () => {
  const url = 'http://localhost:5173/';
  it('uses open on macOS', () => expect(browserOpenCommand('darwin', url)).toEqual({ command: 'open', args: [url] }));
  it('uses cmd start on Windows', () =>
    expect(browserOpenCommand('win32', url)).toEqual({ command: 'cmd', args: ['/c', 'start', '', url] }));
  it('uses xdg-open elsewhere', () => expect(browserOpenCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] }));
});

describe('waitForHttpOk', () => {
  it('resolves true once fetch answers', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; if (calls < 3) throw new Error('ECONNREFUSED'); return { status: 200 }; };
    await expect(waitForHttpOk('http://x/', { timeoutMs: 1000, intervalMs: 1, fetchImpl })).resolves.toBe(true);
    expect(calls).toBe(3);
  });
  it('resolves false on timeout', async () => {
    const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
    await expect(waitForHttpOk('http://x/', { timeoutMs: 20, intervalMs: 5, fetchImpl })).resolves.toBe(false);
  });
});
```

- [x] `npm test -w server -- browser` → 失败（模块不存在）。
- [x] 实现 `scripts/browser.mjs`（`waitForHttpOk` 任何 HTTP 响应都算就绪；异常继续轮询）与 `browser.d.mts` 声明。
- [x] `npm test -w server -- browser` → 通过。

### Task 2: `start.mjs` 接入

**Files:** Modify `scripts/start.mjs`

- [x] spawn children 之后加：

```js
if (process.env.TANKU_OPEN_BROWSER === '1') {
  const url = resolveWebUrl(process.env);
  waitForHttpOk(url, { timeoutMs: 60_000, intervalMs: 500, fetchImpl: fetch }).then((ready) => {
    if (!ready || stopping) return;
    const { command, args } = browserOpenCommand(process.platform, url);
    const opener = spawn(command, args, { detached: true, stdio: 'ignore' });
    opener.on('error', (error) => console.warn(`[tanku Anime] Could not open the browser: ${error.message}. Open ${url} manually.`));
    opener.unref();
  });
}
```

- [x] `npm run verify:start` 仍通过；`TANKU_OPEN_BROWSER=1 npm start` 手工跑一次确认浏览器被打开（然后 Ctrl+C）。

### Task 3: 双击启动器

**Files:** Create `tanku Anime.command`、`tanku Anime.bat`、`.gitattributes`

- [x] `tanku Anime.command`（`chmod +x`）：

```bash
#!/bin/bash
# tanku Anime 起動用。ダブルクリックで server と web を起動し、ブラウザを開く。
cd "$(dirname "$0")" || exit 1
export PATH="$PWD/.tools/node/bin:$PWD/.tools/ffmpeg:$PATH:/opt/homebrew/bin:/usr/local/bin"
export TANKU_OPEN_BROWSER=1
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" != "22" ]; then
  echo "[tanku Anime] Node.js 22 was not found. Run the install command from README.md first."
  read -r -p "Press Enter to close this window..." _
  exit 1
fi
npm start
status=$?
echo; echo "[tanku Anime] stopped (exit code $status)."
read -r -p "Press Enter to close this window..." _
```

- [x] `tanku Anime.bat`：同样逻辑（`cd /d "%~dp0"`、`set "PATH=%CD%\.tools\node;%CD%\.tools\ffmpeg;%PATH%"`、`for /f` 取 node 主版本、`npm start`、`pause`）。
- [x] `.gitattributes`：`*.bat text eol=crlf` / `*.command text eol=lf` / `*.sh text eol=lf` / `*.ps1 text eol=crlf`。
- [x] 本机 `open "tanku Anime.command"`：新 Terminal 窗口起服务并打开浏览器；确认后 Ctrl+C 关闭。

### Task 4: `scripts/install.sh`

**Files:** Create `scripts/install.sh`

- [x] 结构：`set -euo pipefail`；顶部常量（REPO、REF、INSTALL_DIR、TOOLS）；函数
  `log/warn/die`、`fetch_source`（tarball → 临时目录 → `tar --strip-components=1`；`.git` 存在时 `git pull --ff-only || warn`）、
  `ensure_node`（PATH 22 → 用；`.tools/node/bin/node` 22 → 用；否则解析 `SHASUMS256.txt` 取 `darwin|linux`+`arm64|x64` 文件名，curl 下载、`shasum -a 256 -c`、解压到 `.tools/node`）、
  `ensure_ffmpeg`（PATH 有两者 → 用；darwin：brew 有则 `brew install ffmpeg`，否则 Rosetta 探测 + evermeet 两个 zip 解压到 `.tools/ffmpeg`；linux：提示后继续）、
  `install_deps`（lock 哈希未变且 `node_modules` 存在 → 跳过；否则 `npm ci`）、
  `setup_dictionary`（`npm run setup:jmdict || warn`）、`create_shortcut`（`ln -sfn` 到 `~/Desktop`）、
  `launch`（`TANKU_NO_LAUNCH` 未设且 darwin → `open`）。
- [x] `bash -n scripts/install.sh`；有 shellcheck 则跑。
- [x] 真跑：`HOME=<tmp> TANKU_INSTALL_DIR=<tmp>/tankuanime TANKU_REF=<当前 commit 或 master> TANKU_NO_LAUNCH=1 PATH=/usr/bin:/bin bash scripts/install.sh`
  （PATH 里没有 node/ffmpeg/brew → 走下载分支）。确认 `.tools/node/bin/node -v` 为 v22、`.tools/ffmpeg/ffprobe -version` 可跑、`node_modules` 存在。
- [x] 再跑一次同命令：确认 Node/FFmpeg/npm ci 全部跳过。

### Task 5: `scripts/install.ps1`

**Files:** Create `scripts/install.ps1`

- [x] 与 Task 4 同构：`$ErrorActionPreference='Stop'`、`$ProgressPreference='SilentlyContinue'`；
  `Get-Source`（zip → `Expand-Archive` → 移动子目录内容）、`Ensure-Node`（`win-x64`/`win-arm64` zip、`Get-FileHash` 校验）、
  `Ensure-Ffmpeg`（gyan essentials zip → 只复制 `bin\ffmpeg.exe`、`bin\ffprobe.exe`）、`Install-Deps`、`Setup-Dictionary`、
  `New-Shortcut`（`WScript.Shell`）、`Start-App`（`Start-Process` `.bat`）。
- [x] 本地无 Windows 也无 `pwsh`：未能在本地解析/执行 `.ps1`，正确性完全依赖 Task 6 的 CI（2026-08-17 实施记录）。

### Task 6: CI `install-smoke`

**Files:** Modify `.github/workflows/ci.yml`

- [x] 新 job `install-smoke`，matrix `macos-latest` / `windows-latest`：checkout → 运行对应脚本
  （env `TANKU_REF=${{ github.sha }}`、`TANKU_INSTALL_DIR=${{ runner.temp }}/tanku-install`、`TANKU_NO_LAUNCH=1`）→
  在安装目录用其 Node 跑 `npm run verify:start`。

### Task 7: 文档

- [x] 三语 README「Quick start」最前加「一行安装」+「以后双击」；保留手动步骤。
- [x] `docs/DEVELOPMENT.md` §3 功能表一行、§4 决策三条（tarball 而非 git；官方 Node 包而非 fnm/winget；FFmpeg 应用私有 `.tools`）、§6.4 状态、验证记录。
- [x] `CHANGELOG.md` Unreleased。
- [x] `npm test` 全绿。
