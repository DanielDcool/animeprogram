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
   → 填入设置页。之后媒体库里点「字幕を探す」即可：首次为每部番选一次对应作品，
   之后同系列自动按集数下载（优先 .srt）。已有字幕的条目也可点「↺ 字幕」重新拉取。

## 启动

```bash
npm start
```
浏览器打开 http://localhost:5173：

- 「見つける」显示当前季、上一季与“今季首先看 3 部”，也可按日文、罗马字或英文名搜索。
- 作品详情列出 AniList 收录的官方播放/官网入口；外部服务能否在所在地区播放，以服务页面为准。
- 「ライブラリ」→「フォルダをスキャン」导入本地视频（mkv 会自动 remux 成 mp4，秒级）。

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
- H.265/10bit 源浏览器无法播放，媒体库会标记「要トランスコード」，建议换 H.264 源
- 测试：`npm test`
- AI 协作与开发上下文：先读 `AGENTS.md` 和 `docs/DEVELOPMENT.md`

## 资源边界与后续

应用当前只展示 AniList 标记的 HTTPS 官方播放/官网链接；不会聚合盗版播放页、磁力链接或不明下载文件。
合法取得的视频仍统一放入 `~/AnimeLibrary`，字幕可由 jimaku 自动匹配。应用内资源下载器尚未实现，
开工前需先确认合法数据源、下载方式和暂停/恢复/做种等生命周期设计。
