# 本机下载交接 MVP 实施计划

> **For Codex/Claude:** 按任务顺序执行；每个纯逻辑与路由任务先写失败测试，再做最小实现。首版范围只包含「详情页搜索 Nyaa RSS → 展示资源 → 用本机下载器打开 magnet」，下载完成后由用户在媒体库手动扫描；不引入下载状态机、目录监听或 qBittorrent Web API。

**目标：** 在动画详情页搜索适合本地播放的 Nyaa 动画资源，并把经过校验的 magnet 链接交给用户电脑上的 qBittorrent；视频始终下载到用户本地目录，网站服务器不保存视频。

**架构：** 服务端新增可替换的 `ResourceProvider` 边界，首个实现读取 Nyaa RSS、解析固定字段、归一化画质/编码并构造 magnet。详情页通过新的资源 API 获取结果；点击链接时使用浏览器原生外部协议交给本机默认下载器。下载完成后的入库、字幕匹配继续复用现有媒体库扫描与 jimaku 管线。

**技术栈：** Fastify、TypeScript、Node 内置 `fetch`、React、Vite、Vitest。

**实施备注（2026-07-22）：** 代码按此计划完成。安装阶段发现 qBittorrent 5.2.3 的 Homebrew cask
已因 Gatekeeper 校验问题弃用，本机签名也不受信任，因此没有绕过系统安全检查；改用标准 `magnet:`
同样支持的 Transmission 4.1.3，并把默认目录设为 `/Users/daniel/AnimeLibrary`。网页协议与服务端无需改架构。

---

## Task 1：Nyaa RSS 解析与资源排序

**文件：**

- 新建：`server/src/modules/resource/provider.ts`
- 新建：`server/src/modules/resource/nyaa.ts`
- 新建：`server/test/resource-provider.test.ts`

### 1. 先写失败测试

覆盖以下行为：

- 从一段固定 RSS fixture 解析标题、详情页、info hash、大小、做种数、可信/重制标记。
- 由合法的 40 位十六进制 info hash 构造 `magnet:?xt=urn:btih:...`；缺失或非法 hash 的条目被丢弃。
- 从标题识别 `1080p` / `720p`、`H.264` / `H.265` / `AV1`、发布组；H.265/AV1 标记为可能需要转码。
- 排序优先级为：可信资源、做种数、1080p、H.264、发布时间。
- 多个搜索标题按顺序回退：首个标题没有结果时才请求第二个；出现结果后停止。
- 同一 info hash 去重；5 分钟内相同查询复用缓存。
- 上游非 2xx、超时或无效 XML 转成统一的 `ResourceUpstreamError`。

执行：

```bash
npm --workspace server test -- resource-provider.test.ts
```

预期：因为模块尚不存在而失败。

### 2. 实现最小 provider 边界与解析器

在 `provider.ts` 定义：

```ts
export type ResourceCategory = 'english' | 'raw' | 'all'

export interface ResourceResult {
  id: string
  title: string
  detailUrl: string
  magnet: string
  size: string
  sizeBytes: number | null
  seeders: number
  leechers: number
  downloads: number
  publishedAt: string | null
  trusted: boolean
  remake: boolean
  category: string
  releaseGroup: string | null
  resolution: '2160p' | '1080p' | '720p' | 'other' | null
  codec: 'H.264' | 'H.265' | 'AV1' | 'unknown'
  needsTranscode: boolean
}

export interface ResourceSearchResponse {
  items: ResourceResult[]
  query: string
}

export interface ResourceProvider {
  search(queries: string[], category: ResourceCategory): Promise<ResourceSearchResponse>
}
```

在 `nyaa.ts`：

- 固定官方源 `https://nyaa.si/`，分类映射：英语字幕 `1_2`、生肉 `1_4`、全部动画 `1_0`。
- 使用 `URL` / `URLSearchParams` 构造 RSS 地址，禁止把用户输入拼接为任意上游 URL。
- 使用只面向 Nyaa RSS 固定结构的小型解析器，正确处理 CDATA 和常见 XML entity；不引入额外 XML 依赖。
- `fetch` 使用超时信号；只接受 HTTPS 详情链接与合法 info hash。
- 构造 magnet 时只写 `xt` 与经过编码的 `dn`，不注入未知 tracker。
- 提供可注入的 `fetchImpl` 和时钟，便于无网络单测。

### 3. 运行测试

```bash
npm --workspace server test -- resource-provider.test.ts
```

预期：全部通过。

---

## Task 2：资源搜索 API

**文件：**

- 新建：`server/src/modules/resource/routes.ts`
- 修改：`server/src/index.ts`
- 新建：`server/test/resource-routes.test.ts`

### 1. 先写失败的路由测试

通过假的 `CatalogProvider` 和 `ResourceProvider` 覆盖：

- `GET /api/catalog/anime/:id/resources` 默认搜索英语字幕资源。
- 查询标题按 `native → romaji → english` 去重后传给 provider。
- `category=raw|all` 正确透传；非法分类返回 400。
- 动画不存在返回 404。
- 上游失败返回 502 和稳定错误码 `RESOURCE_UNAVAILABLE`。
- 成功响应包含 `items`、实际 `query`、`category` 与 Nyaa 外部搜索回退链接。

执行：

```bash
npm --workspace server test -- resource-routes.test.ts
```

预期：路由尚不存在而失败。

### 2. 实现路由并注册共享依赖

- 让 `server/src/index.ts` 只创建一个 AniList catalog provider，并同时传给 catalog 路由和 resource 路由。
- resource 路由不接收任意搜索字符串，只接收 AniList id；由服务端读取动画标题再搜索，减少滥用与 SSRF 面。
- Nyaa 回退链接同样通过 `URLSearchParams` 生成。
- 上游无结果是正常的 `200 { items: [] }`，不当成服务器错误。

### 3. 运行路由与服务端全量测试

```bash
npm --workspace server test -- resource-routes.test.ts
npm --workspace server test
```

预期：全部通过。

---

## Task 3：动画详情页资源列表与 magnet 交接

**文件：**

- 修改：`web/src/types.ts`
- 修改：`web/src/api.ts`
- 新建：`web/src/catalog/resourceView.ts`
- 新建：`web/src/catalog/ResourceResults.tsx`
- 修改：`web/src/pages/AnimeDetailPage.tsx`
- 修改：`web/src/index.css`
- 新建：`web/test/resource-view.test.ts`

### 1. 先写失败的前端逻辑测试

覆盖展示逻辑：

- 资源的画质、编码、大小与做种数能生成稳定标签。
- `needsTranscode` 时显示兼容性提醒，不把资源误标为不可用。
- 空结果、上游错误与正常结果对应不同 UI 状态。

执行：

```bash
npm --workspace web test -- resource-view.test.ts
```

预期：帮助函数尚不存在而失败。

### 2. 添加 API 类型与调用

- 在 `types.ts` 镜像服务端资源响应类型。
- 在 `api.ts` 新增 `catalogResources(animeId, category)`；组件不直接调用 `fetch`。

### 3. 实现详情页资源区域

在现有官方观看入口之后添加：

- 标题「ローカル用リソース」。
- 明确说明「動画はこのサーバーではなく、このMacのダウンロード先に保存されます」。
- 默认不发请求，用户点击「ダウンロードを探す」后才查询。
- 分类切换：字幕付き（默认）、字幕なし、すべて。
- 结果显示标题、发布组、画质、编码、大小、做种数；可信资源有标识。
- H.265 / AV1 显示「ブラウザ再生には変換が必要な場合があります」。
- 主操作是原生 `<a href="magnet:...">ローカルのダウンロードアプリで開く</a>`，保留浏览器用户手势并交给系统协议处理器。
- 详情链接与回退搜索链接打开 Nyaa 新标签，使用 `rel="noreferrer"`。
- 空结果和上游失败都保留「Nyaa で検索」回退入口。
- 资源区在窄屏保持可读，不改变现有详情页主体结构。

### 4. 运行前端测试与构建

```bash
npm --workspace web test
npm --workspace web run build
```

预期：全部通过。

---

## Task 4：本机下载器与完整验证

**文件：**

- 修改：`README.md`
- 修改：`docs/DEVELOPMENT.md`
- 修改：`docs/superpowers/specs/2026-07-22-local-download-pipeline-design.md`

### 1. 安装与配置本机 magnet 下载器

- 先检查 qBittorrent；若不能通过 macOS 正常安全校验，不绕过 Gatekeeper，改用 Transmission。
- 启动后把默认保存目录设为与应用 `MEDIA_DIR` 相同的本地目录，当前推荐 `~/AnimeLibrary`。
- 不启用下载器 RPC/WebUI，不把下载任务或视频传给应用服务器。

### 2. 验证外部源与 UI

- 用真实动画详情页请求资源；若 Nyaa 当前网络不可达，验证错误提示与外部搜索回退，不伪造成功结果。
- 在浏览器确认资源区的加载、分类切换、结果/错误状态和 magnet href。
- 不在自动验证中实际下载受版权保护的视频；只验证交接链接和本机协议处理能力。
- 下载完成后的闭环仍为：媒体库点击「フォルダをスキャン」→ 识别视频 → jimaku 自动/手动匹配字幕。

### 3. 全量验证

```bash
npm test
```

并检查浏览器控制台没有由本次功能引入的新错误。

### 4. 文档收尾

- `README.md` 增加本机 qBittorrent、保存目录和使用步骤。
- `docs/DEVELOPMENT.md` 把首版状态更新为已完成，并保留未做范围：目录监听、下载进度、WebUI、状态机。
- 设计文档状态从「待审阅」改为首版已实施；复杂版仍作为未来扩展，不把它误记为当前功能。

最终不自动提交或推送；只有用户明确要求后再执行 Git 提交和 GitHub 推送。
