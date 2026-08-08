# 开源首用降摩擦：启动预检 + JMdict 一键安装 设计

> 状态：已确认（2026-08-08，用户在开源差距分析后批准该范围）。
> 背景见 `docs/DEVELOPMENT.md` §6.4 开源发布准备。本设计只覆盖两项安装摩擦，
> 不包含截图、Release、演示素材等需要用户参与的发布项。

## 目标

1. **启动预检**：把「装错 Node 版本」「没装 FFmpeg」这两类最常见的失败，从
   深处的报错（better-sqlite3 段错误 / 导入视频失败）提前到 `npm start` 的第一屏，
   并给出按平台的修复指引。
2. **JMdict 一键安装**：把「手动找 release → 下载 zip → 解压到精确路径 → 跑导入」
   四步收敛为一条命令 `npm run setup:jmdict`。

## 非目标

- 不做设置页内的词典下载 UI（先让 CLI 可靠，再按真实反馈决定是否做 UI）。
- 不改 better-sqlite3 / Node 版本策略本身（`node:sqlite` 迁移另行评估）。
- 不引入代理配置；下载直连 GitHub，失败时给出手动路径兜底。

## 设计 1：启动预检

- 新增 `scripts/precheck.mjs`：纯 Node ESM，无第三方依赖，导出可测试的纯函数；
  实际检测通过注入的 exec 函数完成（`spawnSync <tool> -version`）。
  同目录 `scripts/precheck.d.mts` 提供类型声明，保证 server 的 `tsc --noEmit`
  与测试引用不报错。
- `scripts/start.mjs` 在 spawn server/web 之前运行预检：
  - **Node 主版本 ≠ 22 → 硬失败退出 1**。原因：better-sqlite3 锁 v11，其他大版本
    要么本地编译要么段错误，启动后必然坏且报错难懂。提示信息给 nodejs.org 22 下载、
    fnm 用法与 `.node-version`。
  - **ffmpeg 或 ffprobe 不在 PATH → 打印醒目警告但继续启动**。原因：发现页、
    生词本、已导入媒体不依赖 FFmpeg；CI runner 也不保证有 ffmpeg，
    `npm run verify:start` 必须继续可用。警告按平台给安装提示
    （macOS：brew；Windows：官方 FFmpeg 下载页并检查两个 exe；Linux：发行版包管理器）。
  - `TANKU_SKIP_PRECHECK=1` 跳过全部预检（逃生口，CI 或特殊环境用）。
- 测试：`server/test/precheck.test.ts` 覆盖 Node 版本判定、工具缺失分级、
  平台提示文案、跳过开关。检测函数全部注入，不真实 spawn。

## 设计 2：JMdict 一键安装

- 新增依赖：`fflate`（server dependencies；零依赖、自带类型，测试可用 `zipSync`
  在内存里造夹具，不往仓库提交二进制）。
- 纯逻辑放 `server/src/modules/analyze/jmdict-download.ts`：
  - `pickJmdictAsset(assets)`：从 GitHub release assets 中选 `jmdict-eng-<semver>….json.zip`，
    排除 `common` 精简版；找不到返回明确错误信息。
  - `pickZipJsonEntry(names)`：从 zip 条目中选唯一 `.json` 文件。
  - `extractZipEntryToFile(zipPath, entryName, destPath)`：fflate 流式解压到目标文件。
- 编排脚本 `server/scripts/setup-jmdict.ts`（tsx 运行）：
  1. 目标 `server/vendor/jmdict-eng.json`（`JMDICT_VENDOR_DIR` 可覆盖，供验证与测试）。
     已存在且未加 `--force` → 跳过下载直接导入。
  2. 取 release 元数据：默认锁定已验证 tag `3.6.2+20260720135044`
     （见 DEVELOPMENT.md 导入基线）；`--tag <tag>` 或 `--latest` 覆盖。
     经 GitHub API 解析 asset 的 `browser_download_url`，带 User-Agent。
  3. 流式下载到同目录 `.download` 临时文件，成功后解压出 json、删除临时 zip。
  4. 复用现有 `createDb` + `importJmdict` 导入（`DATA_DIR` 语义不变），输出词条数。
  5. 结束时打印 JMdict/EDRDG 署名与 CC BY-SA 4.0 说明。
- 入口：根 `package.json` 增加 `"setup:jmdict": "npm run setup-jmdict -w server"`；
  server 增加 `"setup-jmdict": "tsx scripts/setup-jmdict.ts"`。
  现有 `import-jmdict` 保留（手动路径兜底，README 继续给出）。
- 失败处理：网络失败 / API 限流 / 找不到 asset 时输出原因和手动下载指引，退出 1，
  不留下半个 vendor 文件（临时文件后缀 + 成功后 rename）。

## 测试与验证

- 单元：asset 选择、zip entry 选择、解压 roundtrip（zipSync 造夹具）、预检纯逻辑。
- 集成验证（不碰用户数据）：`JMDICT_VENDOR_DIR` 与 `DATA_DIR` 指向临时目录，
  实跑一次真实下载与导入；`npm start` 实测正常路径与模拟缺 ffmpeg 的 PATH。
- 回归：`npm test` 全绿，server/web `tsc --noEmit` 通过，`npm run verify:start` 不受影响。

## 文档影响

- 三语 README：JMdict 段改为一条命令，手动路径降级为备选；Quick start 提及预检行为。
- `docs/AI-SETUP.md`：词典步骤同步为 `npm run setup:jmdict`。
- `docs/DEVELOPMENT.md`：现状、决策（warn-vs-fail 分级、fflate、锁定 tag）与验证基线。
