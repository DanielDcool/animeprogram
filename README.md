# ことばアニメ / Kotoba Anime

**A local-first Japanese learning player for anime.** Find a show, watch your own local media with subtitles hidden by default, then pause on the line you missed to analyse it, look up words, get an AI explanation, and save it for review.

> 中文：一个本地优先的日语动画学习播放器。先听、再暂停看当前句、分词查词和按需 AI 讲解，最后保存到生词本复习。

Kotoba Anime is a personal, self-hosted web app. Your media files stay on your computer; the app does not host, proxy, or download video.

## What you can do

- Discover the current and previous anime season, search titles, and open official streaming or information links.
- Learn from local `.mp4` / `.mkv` files with Japanese `.srt` / `.ass` subtitles. MKV files are remuxed when needed for browser playback.
- Stay in listening mode by default: pause to reveal the current line, replay it, jump between lines, or open a transcript that follows playback.
- Tokenize Japanese locally with Kuromoji and look up JMdict definitions.
- Ask Anthropic, DeepSeek, OpenAI, or Google Gemini for a structured explanation only when you want one. Results are cached locally.
- Save words and sentences, then export an Anki-compatible TSV file.
- Optionally connect to Jimaku for subtitle matching, and hand a magnet link to your own local downloader. No downloader RPC, video transfer, or remote media lifecycle is built into the app.

## Quick start (macOS)

**Verified environment:** macOS, Node.js 22+, and FFmpeg. Linux may work but is not yet a supported release target.

```bash
git clone <repository-url>
cd animeprogram
brew install ffmpeg
npm ci
npm start
```

Open [http://localhost:5173](http://localhost:5173). The application creates its local database automatically and watches `~/AnimeLibrary` by default.

To use a different media or data location, set these before starting:

```bash
export MEDIA_DIR="$HOME/Movies/KotobaAnime"
export DATA_DIR="$PWD/.local-data"
npm start
```

## Optional setup

### Japanese dictionary

For local word definitions, download a `jmdict-eng-*.json.zip` release from [JMdict Simplified](https://github.com/scriptin/jmdict-simplified/releases), extract it to `server/vendor/jmdict-eng.json`, then run:

```bash
npm run import-jmdict -w server
```

### AI explanations

In **設定 / Settings**, choose Anthropic, DeepSeek, OpenAI, or Google Gemini and enter that provider's API key. Keys and explanation cache are stored only in the local SQLite database; do not commit keys or the `server/data/` directory.

OpenAI requires an [OpenAI Platform API key](https://platform.openai.com/api-keys). A ChatGPT or Codex subscription by itself is not an API key.

### Subtitles and local media

Put your media and matching Japanese subtitles in `MEDIA_DIR` (default: `~/AnimeLibrary`). Examples:

```text
~/AnimeLibrary/Show - 01.mkv
~/AnimeLibrary/Show - 01.ja.srt
```

External Japanese subtitles are preferred; otherwise the app attempts to extract an embedded Japanese subtitle track from MKV. Jimaku matching is optional and requires an API key you obtain from Jimaku.

## Learning controls

The on-screen control chips are clickable as well as keyboard shortcuts.

| Key | Action |
| --- | --- |
| `Space` | Pause and reveal the current line / resume and hide it |
| `A` | Replay the current line; quickly press it twice to go to the previous line |
| `←` / `→` | Previous / next line |
| `D` | Request an AI explanation of the paused line |
| `S` | Toggle always-visible subtitles |
| `T` | Toggle analysis and transcript; the transcript opens at the current line |
| `[` / `]` | Adjust subtitle timing by −/+100 ms |

On desktop, drag the divider between the player and analysis panel to resize it. Use the in-app full-screen button so subtitles remain visible in full screen.

## Development

```bash
npm test
npm run build -w web
```

The project uses a Fastify server in `server/` and a React/Vite client in `web/`. All browser requests go through `web/src/api.ts`; learning-mode state is kept in `web/src/player/learningMode.ts`.

## Setting up with an AI coding agent

Yes—an `AGENTS.md` file is becoming a useful, cross-tool convention for project-specific coding instructions. This repository has one at the root, plus a safe, command-by-command setup guide for an agent:

1. Ask the agent to read [AGENTS.md](AGENTS.md), this README, and [docs/AI-SETUP.md](docs/AI-SETUP.md).
2. Then give it: “Set up Kotoba Anime locally. Do not expose API keys, modify my media files, or commit changes unless I ask.”

The guide is intentionally explicit about optional components, local data, verification, and actions that require confirmation.

## Contributing

Contributions are welcome once the project is publicly released. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and keep changes focused on reducing real learning friction rather than adding generic platform features.

## Media, privacy, and legal boundary

- Bring only media and subtitles you are authorized to use.
- Your media stays in `MEDIA_DIR`; the app does not upload it.
- The optional resource search only returns public metadata and a magnet handoff for your local downloader. It does not download, host, or proxy video.
- API keys, viewing progress, vocabulary, mappings, and AI explanation cache are local application data. Back up or remove the SQLite data directory deliberately.

## License

Kotoba Anime is released under the [MIT License](LICENSE).

## Open-source readiness

Before publishing, the project still needs a public issue/PR workflow, CI, a security disclosure policy, and screenshots or a short demo. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the current product roadmap.
