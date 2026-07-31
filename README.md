# ことばアニメ

从“这季看什么”到“用这一句学什么”的本地动画网站：实时浏览当季/上季新番、搜索作品和官方播放入口，
再用本地播放器隐藏字幕观看；暂停时显示当前句并做分词、查词、AI 语法讲解。

## 准备

1. Node 22+，ffmpeg（`brew install ffmpeg`）
2. `npm install`
3. 词典（可选但强烈推荐）：从 https://github.com/scriptin/jmdict-simplified/releases
   下载 `jmdict-eng-*.json.zip`，解压为 `server/vendor/jmdict-eng.json`，然后：
   ```bash
   npm run import-jmdict -w server
   ```
4. 视频与字幕放入 `~/AnimeLibrary`（mkv/mp4 + 同名 `.srt`/`.ass`，`Show - 01.ja.srt` 形式也可；
   没有外部字幕时会自动抽取 mkv 内嵌日语字幕）
5. jimaku 字幕自动匹配（可选）：在 https://jimaku.cc 注册 → https://jimaku.cc/profile 复制 API key
   → 填入设置页。没有系列映射时，媒体库会提示点「字幕を探す」为每部番选择一次对应作品；
   之后同系列新剧集会自动按集数下载字幕（优先 .srt）。已有字幕的条目也可点「↺ 字幕」重新拉取。
6. 本机资源下载（可选）：安装 Transmission（`brew install --cask transmission`），在
   Transmission「Settings → Transfers → Default location」选择 `~/AnimeLibrary`，并让它接管 magnet 链接。

## 启动

```bash
npm start
```
浏览器打开 http://localhost:5173：

- 「見つける」显示当前季、上一季与“今季首先看 3 部”，也可按日文、罗马字或英文名搜索。
- 作品详情列出 AniList 收录的官方播放/官网入口；点「ダウンロードを探す」会按作品标题和季度查询 Nyaa RSS，
  自动排除明确标记为其他季度的结果，并优先排列整季、无需转换、H.264/AVC、1080p、合理体积、可信和
  多字幕候选；可切换字幕付き/字幕なし/全部，点击候选的 magnet 后由本机 Transmission 打开确认窗口。
- 「ライブラリ」递归监听 `~/AnimeLibrary`：整季子目录中的视频写入稳定后也会自动导入
  （mkv 会自动 remux 成 mp4）；
  「フォルダをスキャン」保留为未自动反映时的恢复入口。

下载的视频不会经过或保存到本应用服务器：Transmission 直接写入本机 `~/AnimeLibrary`。应用确认文件停止写入后
自动加入媒体库；已有 Jimaku 映射时自动取得字幕，没有映射时只在媒体库内提示选择一次。自动取得失败会保留映射并
显示重试按钮。只下载你有权获取的内容；
Nyaa 的 `trusted` 标记只是站内元数据，不代表版权许可或绝对安全。

新番目录需要联网访问 AniList；即使 AniList 暂时不可用，本地媒体库、播放器和生词本仍能继续使用。

## 快捷键（播放页）

| 键 | 功能 |
|----|------|
| Space | 暂停并显示当前句（右侧自动分词查词）/ 继续（重新隐藏字幕）|
| A | 回到本句开头重听（不显示字幕）|
| ← / → | 上一句 / 下一句 |
| D | 当前句 AI 深度讲解（需在设置页配 Anthropic API key；同句缓存，不重复计费）|
| S | 字幕常显开关（普通看番模式）|
| T | 在「解析 / 字幕一覧」之间切换；点列表中的句子会跳转、暂停并解析 |
| [ / ] | 字幕偏移 ±100ms（持久保存）|

## 生词本

暂停解析时：词卡里点「☆ 保存」收藏单词（辞书形+读音+释义+例句），面板底部「☆ この文を保存」收藏整句
（若已生成 AI 讲解会连中文翻译一起存）。顶部「単語帳」页面查看/删除，
「Anki 用 TSV エクスポート」下载 vocab.tsv → Anki 里 文件→读入（分隔符 Tab、允许 HTML）即可变卡片。

## 技术要点

- `server/`：Fastify + better-sqlite3 + kuromoji + JMdict + AniList GraphQL + Claude API（claude-opus-4-8）
- `web/`：Vite + React，学习模式状态机是纯 reducer（`web/src/player/learningMode.ts`）
- 当前 Mac 浏览器已验证可播放 remux 后的 H.265/HEVC Main 10；H.264 10-bit 等仍不兼容的源会标记
  「要トランスコード」
- 测试：`npm test`
- AI 协作与开发上下文：先读 `AGENTS.md` 和 `docs/DEVELOPMENT.md`

## 资源边界与后续

官方播放入口与本机资源搜索在页面中分区。服务端只查询短暂缓存的公开 Nyaa RSS 元数据、校验 info hash
并返回 magnet；不下载视频、不代理 BitTorrent 数据，也不控制删除/做种。目录监听只观察本机 `MEDIA_DIR`，
仍不读取 Transmission 下载进度、不管理下载任务，也不绑定特定下载器。
