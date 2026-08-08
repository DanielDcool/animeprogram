# tanku Anime

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**A local-first Japanese learning player for anime.** Find a show, watch your own local media with subtitles hidden by default, then pause on the line you missed to analyse it, look up words, get an AI explanation, and save it for review.

> 中文：一个本地优先的日语动画学习播放器。先听、再暂停看当前句、分词查词和按需 AI 讲解，最后保存到生词本复习。

tanku Anime is an early-stage, self-hosted web app. Your media files stay on your computer; the app does not host, proxy, or download video.

## What you can do

- Discover the current and previous anime season, search titles, and open official streaming or information links.
- Learn from local `.mp4` / `.mkv` files with Japanese `.srt` / `.ass` subtitles. MKV files are remuxed when needed for browser playback.
- Keep larger libraries readable: media is grouped by its containing folder, and each folder can be collapsed independently.
- Stay in listening mode by default: pause to reveal the current line, replay it, jump between lines, or open a transcript that follows playback.
- Tokenize Japanese locally with Kuromoji and look up JMdict definitions.
- Ask Anthropic, DeepSeek, OpenAI, or Google Gemini for a structured explanation only when you want one. Results are cached locally.
- Save words and sentences, inspect their meaning, cached AI explanation, and timestamped source, then send them to a `tanku Anime` Anki deck with one click. Existing cards are skipped.
- Optionally connect to Jimaku for subtitle matching, and hand a magnet link to your own local downloader. No downloader RPC, video transfer, or remote media lifecycle is built into the app.

## Quick start

**Requirements:** Node.js 22.x and FFmpeg, with both `ffmpeg` and `ffprobe` available on `PATH`. The full app and real media workflow are manually verified on macOS. A clean Windows machine has also completed the one-sentence AI setup flow through dependency installation, tests, build, `npm start`, the web page, and the health endpoint; real Windows media playback still needs a physical-machine check.

macOS:

```bash
git clone https://github.com/DanielDcool/animeprogram.git
cd animeprogram
brew install ffmpeg
npm ci
npm start
```

Windows PowerShell (after installing [Node.js 22](https://nodejs.org/en/download) and an FFmpeg Windows build linked from the [official FFmpeg download page](https://ffmpeg.org/download.html)):

```powershell
node --version
ffmpeg -version
ffprobe -version
git clone https://github.com/DanielDcool/animeprogram.git
cd animeprogram
npm ci
npm start
```

`node --version` must report `v22.x`. Do not use a moving Node.js "LTS" package alias unless it still resolves to major version 22.

Open [http://localhost:5173](http://localhost:5173). The application creates its local database automatically and watches the `AnimeLibrary` folder in your home directory by default. You can edit the full path in **Settings**; restart the application after saving it.

`MEDIA_DIR` remains the highest-priority process override. To use a temporary media override or a different data location on macOS or Linux, set these before starting:

```bash
export MEDIA_DIR="$HOME/Movies/TankuAnime"
export DATA_DIR="$PWD/.local-data"
npm start
```

On Windows PowerShell, use process-local environment variables:

```powershell
$env:MEDIA_DIR = "$HOME\Videos\TankuAnime"
$env:DATA_DIR = "$PWD\.local-data"
npm start
```

## Optional setup

### Japanese dictionary

For local word definitions, download a `jmdict-eng-*.json.zip` release from [JMdict Simplified](https://github.com/scriptin/jmdict-simplified/releases), extract it to `server/vendor/jmdict-eng.json`, then run:

```bash
npm run import-jmdict -w server
```

### One-click Anki export

Install [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect) in Anki with add-on code `2055492159`, restart Anki, and keep it running. On the vocabulary page, click **Anki に一括追加**. tanku Anime creates a `tanku Anime` deck and note type, sends only new cards, and includes the saved context and timestamped local playback link on the back.

The integration talks only to AnkiConnect on `127.0.0.1:8765`; it never edits Anki's collection database directly. If Anki or AnkiConnect is unavailable, the vocabulary stays unchanged and the page shows the required setup.

### AI explanations

In **設定 / Settings**, choose Anthropic, DeepSeek, OpenAI, or Google Gemini and enter that provider's API key. Keys and explanation cache are stored only in the local SQLite database; do not commit keys or the `server/data/` directory.

OpenAI requires an [OpenAI Platform API key](https://platform.openai.com/api-keys). A ChatGPT or Codex subscription by itself is not an API key.

### Subtitles and local media

Put your media and matching Japanese subtitles in the media directory shown in **Settings** (default: the `AnimeLibrary` folder in your home directory). You may organize shows in subfolders; the library groups them by that relative folder. Examples:

```text
AnimeLibrary/Show/Show - 01.mkv
AnimeLibrary/Show/Show - 01.ja.srt
```

External Japanese subtitles are preferred; otherwise the app attempts to extract an embedded Japanese subtitle track from MKV. Jimaku matching is optional and requires an API key you obtain from Jimaku.

The magnet button is also optional. It requires a magnet-capable desktop downloader registered with the operating system. On Windows, install or reconfigure that downloader only with the user's confirmation, and point its save folder at the media directory shown in **Settings** if automatic library pickup is wanted. Prefer H.264 8-bit releases for the broadest browser compatibility; Windows HEVC support varies by OS, hardware, extensions, and browser, so tanku Anime conservatively marks H.265 as needing conversion there.

## Learning controls

The on-screen control chips are clickable as well as keyboard shortcuts.

| Key | Action |
| --- | --- |
| `Space` | Pause and reveal the current line / resume and hide it |
| `A` | Replay the current line; quickly press it twice to go to the previous line |
| `←` / `→` | Previous / next line |
| `D` | Request an AI explanation of the selected learning line |
| `S` | Toggle always-visible subtitles |
| `T` | Toggle analysis and transcript; the transcript opens at the current line |
| `[` / `]` | Adjust subtitle timing by −/+100 ms |

On desktop, drag the divider between the player and analysis panel to resize it. Use the in-app full-screen button so subtitles remain visible in full screen.

The analysis panel keeps the selected line while you replay it, even when subtitles are hidden. It changes only after you pause on or select another line.

Reopening a video resumes from its last saved viewing position. A source link from the vocabulary detail page takes priority once and opens directly at that saved sentence time.

## Development

```bash
npm test
npm run build -w web
```

The project uses a Fastify server in `server/` and a React/Vite client in `web/`. All browser requests go through `web/src/api.ts`; learning-mode state is kept in `web/src/player/learningMode.ts`.

## Setting up with an AI coding agent

Give an AI coding agent this one sentence:

> Install and start tanku Anime from https://github.com/DanielDcool/animeprogram on this computer.

The agent is responsible for reading [AGENTS.md](AGENTS.md), this README, and [docs/AI-SETUP.md](docs/AI-SETUP.md). Those files define the safety boundaries, platform checks, optional components, and verification steps, so users do not need to repeat them. On Windows, the agent must verify Node.js 22, both FFmpeg executables, dependencies, tests, startup, the web page, and the health endpoint before saying the installation works.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md). Keep changes focused on reducing real learning friction rather than adding generic platform features.

## Media, privacy, and legal boundary

- Bring only media and subtitles you are authorized to use.
- Your media stays in the configured local media directory; the app does not upload it.
- The optional resource search only returns public metadata and a magnet handoff for your local downloader. It does not download, host, or proxy video.
- API keys, viewing progress, vocabulary, mappings, and AI explanation cache are local application data. Back up or remove the SQLite data directory deliberately.
- The server listens on `127.0.0.1` by default. Do not expose it to an untrusted network; API keys are currently stored in the local SQLite database in plaintext. See [SECURITY.md](SECURITY.md) for reporting and threat-model details.

## License

tanku Anime is released under the [MIT License](LICENSE).

## Project status

The project is public and has cross-platform CI plus contribution and security policies. macOS has full manual verification; Windows has compatibility fixes, automated coverage, and a verified clean installation/startup, with physical-machine media playback still pending. A copyright-safe screenshot or short demo is also needed before broader promotion. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the current roadmap.
