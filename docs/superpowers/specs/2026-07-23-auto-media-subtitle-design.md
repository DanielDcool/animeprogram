# 媒体自动扫描与 Jimaku 字幕衔接设计

日期：2026-07-23  
状态：已实施并验证

## 1. 背景与成功标准

当前资源详情页已经可以把合法 `magnet:` 交给本机 Transmission，下载器默认把视频写入
`~/AnimeLibrary`。剩余摩擦是下载完成后仍要回到媒体库手动扫描，再手动触发 Jimaku。

本阶段完成后，用户流程应变为：

```text
详情页选择资源
  → 本机下载器写入 MEDIA_DIR
  → 本地服务确认文件写入完成
  → 自动导入媒体库
  → 已有 Jimaku 映射：按集数自动取得字幕
  → 没有映射：媒体库内提示选择一次
  → 之后同系列新剧集自动取得字幕
```

成功标准：

1. 服务运行期间，新加入 `MEDIA_DIR` 的 `.mkv` / `.mp4` 在写入稳定后自动导入。
2. 服务关闭期间完成的文件，在下次启动后也能被发现。
3. 下载中的半成品不会被写入 `media`；探测失败后仍可重试。
4. 新媒体已有字幕时不调用 Jimaku；没有字幕但已有系列映射时自动按集数下载。
5. 没有映射时不弹窗打断，只在媒体库顶部和对应条目提示用户选择一次。
6. 已有映射但自动下载失败时保留映射，在对应条目显示原因和重试按钮。
7. 手动「フォルダをスキャン」继续可用，并复用同一套扫描和字幕衔接逻辑。

## 2. 范围边界

### 2.1 本阶段包含

- `MEDIA_DIR` 启动对账、文件系统监听和低频定时兜底。
- 文件大小与修改时间稳定判定。
- 扫描指定文件并返回本次导入结果。
- Jimaku 下载逻辑从 HTTP 路由抽成可复用服务。
- 字幕自动化状态持久化、串行队列、失败重试。
- 媒体列表显示自动字幕状态并在页面打开时定时刷新。
- 自动测试、真实浏览器验证和协作文档更新。

### 2.2 本阶段明确不包含

- Transmission 或 qBittorrent RPC/WebUI、下载进度和任务管理。
- 在 Fastify 中下载、代理、删除或做种视频。
- 自动选择模糊的 Jimaku 作品候选。
- OS 通知、弹窗或后台常驻菜单栏程序。
- 递归扫描任意目录；仍只处理配置的单一 `MEDIA_DIR`。
- H.265 转码兜底、远程设备目录和视频同步。

下载器仍只通过通用 magnet 协议衔接。将来更换下载器，只要最终写入同一个 `MEDIA_DIR`，本功能无需修改。

## 3. 方案选择

采用“文件系统事件唤醒 + 周期对账”的混合方案：

- `fs.watch` 用于尽快发现目录变化，但不把事件本身视为文件已经下载完成。
- 周期对账用于弥补 macOS 文件事件合并、丢失以及应用关闭期间发生的变化。
- 不采用纯 `fs.watch` 立即扫描，因为当前 scanner 在探测失败后会写入 `unknown`，可能把半成品永久跳过。
- 不采用下载器 RPC，因为它会增加安全配置和客户端耦合，却不能覆盖手动复制文件等入口。

## 4. 扫描与文件稳定性

### 4.1 候选文件

只接受媒体目录第一层中的 `.mkv` 和 `.mp4`，扩展名不区分大小写。忽略：

- 由应用生成的 `.play.mp4`；
- 隐藏文件；
- 非普通文件；
- 大小为 0 的文件；
- 已经存在于 `media.file_path` 的文件。

### 4.2 稳定判定

每个候选记录 `size`、`mtimeMs` 与 `stableSince`。只有大小和修改时间连续 15 秒不变才进入扫描。
任一值变化就重置计时。监听事件只触发提前对账，不绕过这项判定。

默认周期对账间隔为 30 秒；常量可以在测试中注入，但首版不做设置页选项。

### 4.3 Scanner 行为调整

扫描器增加“扫描指定绝对路径集合”的入口，并返回：

```ts
interface ScanResult {
  importedIds: number[];
  failedFiles: string[];
}
```

整目录手动扫描只负责列出文件，然后调用同一入口。探测失败时不再插入 `codec_status='unknown'` 的媒体行，
而是把路径放入 `failedFiles`。这样半成品或暂时不可读文件能在下一轮重试；真正损坏的文件不会污染媒体库。

扫描仍保持幂等：已存在的 `file_path` 直接跳过。外部字幕优先、内嵌字幕抽取、remux 与可播放性判断不改变。

## 5. Jimaku 服务与自动化状态

### 5.1 可复用下载服务

把当前 `POST /api/media/:id/jimaku/download` 中的文件选择、下载、落盘、映射更新和
`subtitle_file` 更新抽到 `jimaku/service.ts`。HTTP 路由和后台自动化调用同一个函数，避免本地服务反向请求自己的 HTTP API。

服务接收 `db`、`mediaId`、可选 `entryId` 与可注入 `clientFactory`，成功返回实际文件名；业务错误使用稳定 code：

- `MEDIA_NOT_FOUND`
- `JIMAKU_NOT_CONFIGURED`
- `NO_ENTRY`
- `NO_FILE`
- `JIMAKU_ERROR`

### 5.2 持久化状态

新增 `subtitle_sync_state` 表：

```sql
CREATE TABLE IF NOT EXISTS subtitle_sync_state (
  media_id INTEGER PRIMARY KEY REFERENCES media(id),
  status TEXT NOT NULL CHECK(status IN ('needs_mapping', 'downloading', 'failed')),
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

状态只描述“没有可用字幕的媒体为什么还没完成”，成功取得字幕后删除该行。错误信息只保存适合用户查看的简短文本，
不得包含 API key、请求头或完整第三方响应。

### 5.3 对账与队列

后台字幕协调器处理所有“没有 `subtitle_file`”的媒体：

- 没有系列映射：写入 `needs_mapping`，不调用 Jimaku 搜索。
- 有映射但没有 API key：写入 `failed`，提示去设置页配置。
- 有映射且配置完整：写入 `downloading`，进入去重串行队列。
- 成功：删除状态行。
- 失败：保留映射，写入 `failed` 与简化错误。

服务启动时对全部现有媒体执行一次字幕对账；scanner 每次返回新增 ID 后只补充处理这些 ID。
同一个媒体 ID 同时最多存在一个任务。请求之间保留最小间隔，默认 2500ms，避免短时间触发 Jimaku 的
25 次/分钟限制；测试中注入零等待。

用户在媒体库手动选择候选或点击重试时仍走同一个下载服务，并同步清除或更新 `subtitle_sync_state`。

## 6. 生命周期与故障隔离

- 自动化只在真实服务进程启动时启用，不让 `buildApp()` 的路由测试触碰用户媒体目录。
- 服务监听成功后启动 watcher 与字幕对账；Fastify 关闭时清理 `fs.watch`、interval 和待调度计时器。
- 对账过程设互斥锁，避免文件事件与周期任务同时扫描。
- 单个文件探测、remux 或 Jimaku 失败只记录该项目，不停止后续项目。
- Nyaa、AniList、Jimaku 或下载器故障不得影响已有本地媒体的播放。

## 7. API 与媒体库交互

`GET /api/media` 为每个条目增加：

```ts
type SubtitleStatus = 'ready' | 'needs_mapping' | 'downloading' | 'failed';

interface MediaItem {
  // 现有字段保持不变
  subtitleStatus: SubtitleStatus;
  subtitleError: string | null;
}
```

媒体库打开期间每 5 秒刷新一次列表，离开页面即停止。首版不用 SSE/WebSocket。

交互规则：

- 页面顶部仅在 `needs_mapping` 数量大于 0 时显示：`字幕作品の選択が必要です（N件）`。
- `needs_mapping`：保留「字幕を探す」按钮，点击后显示现有候选列表。
- `downloading`：显示「字幕を取得中…」，不允许重复触发。
- `failed`：显示简短失败原因与「再試行」；重试使用已有映射，不重新要求选择。
- `ready`：维持现有「↺ 字幕」重新取得入口。
- 不使用全局弹窗，不自动切换页面，不打断播放器。

## 8. 测试与完成验证

### 8.1 自动测试

- scanner：指定文件、返回新增 ID、幂等、探测失败不入库且下次可重试。
- 稳定性：文件第一次出现不扫描；15 秒内变化会重置；稳定后只触发一次；周期对账能发现漏掉的事件。
- Jimaku 服务：显式/已有映射、成功替换字幕、无映射、无文件与上游错误。
- 字幕协调器：无映射、已有字幕跳过、串行去重、成功清理、失败持久化、启动恢复。
- media API：返回 `subtitleStatus` 与脱敏错误。
- web 纯逻辑：顶部计数和四种状态的文案/按钮。

完成前运行：

```bash
npm test
npm --workspace web run build
```

### 8.2 浏览器验证

使用本地临时测试视频或可安全生成的小型媒体文件验证：

1. 文件写入期间媒体库不出现条目。
2. 写入稳定后自动出现，无需点击扫描。
3. 无映射时顶部提示和条目按钮正确。
4. 选择 Jimaku 候选后字幕成功写入，提示消失。
5. 已有映射的新一集自动取字幕；模拟失败时显示原因和重试按钮。
6. 页面轮询不会产生控制台 warning/error，离开页面后停止请求。

真实 Jimaku 请求只在必要时少量联调；自动测试全部使用 fake client，不记录凭证。

## 9. 文档与兼容性

实施完成后同步更新：

- `docs/DEVELOPMENT.md`：把目录监听与字幕自动衔接移入已完成，并记录新的架构边界和验证基线。
- `README.md`：把“下载后手动扫描”改为自动发现，同时保留手动扫描作为恢复入口。
- `docs/superpowers/specs/2026-07-22-local-download-pipeline-design.md`：标记原先保留的自动衔接已由本文实施。

不新增 npm 依赖，不修改 `MEDIA_DIR` 默认值，不迁移或删除已有媒体、字幕、进度和 Jimaku 映射数据。
