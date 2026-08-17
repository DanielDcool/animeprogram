# Changelog

All notable changes to tanku Anime are documented here. This project follows
[Semantic Versioning](https://semver.org/); until 1.0.0, minor versions may include breaking changes.

## [Unreleased]

### Setup

- One-line installer: `curl -fsSL …/scripts/install.sh | bash` (macOS/Linux) and `irm …/scripts/install.ps1 | iex` (Windows). It downloads the source without git, keeps a private Node.js 22 (official build, SHA-256 verified) and FFmpeg under `~/tankuanime/.tools/`, runs `npm ci` and the dictionary setup, puts a shortcut on the Desktop, and starts the app once. Needs no administrator rights and does not change the system `PATH` or shell profile; running it again updates in place.
- Double-click launchers `tanku Anime.command` (macOS) and `tanku Anime.bat` (Windows) in the repository root; they start both processes and open the browser when the page is ready. `npm start` gets the same behaviour with `TANKU_OPEN_BROWSER=1`.

### Learning

- AI explanations can be written in Chinese or English; the default follows the system language.

### Discovery

- Drama search shows Bangumi title cards with poster, score, and episode count; the direct Nyaa keyword search remains under 「もっと探す」.

## [0.1.0] — 2026-08-16

First tagged release. Everything below was built between 2026-07-21 and 2026-08-16.

### Learning

- Listening-first player: subtitles hidden by default, `Space` pauses and reveals the current line, `A` replays it, `←` / `→` step between lines, `S` toggles always-on subtitles, `[` / `]` shift subtitle timing.
- Local tokenization with Kuromoji plus JMdict lookup — no network call, no cost.
- Optional AI explanation on `D` covering translation, grammar structure, phrasing, and tone. Anthropic, DeepSeek, OpenAI, and Google Gemini supported; responses cached in local SQLite.
- Transcript tab that follows playback; selecting a line jumps, pauses, and analyses it.
- Playback position is restored per video; vocabulary source links open at the saved timestamp.

### Discovery

- Anime mode: current and previous season from AniList, search in Japanese, romaji, or English, with official streaming and info links.
- Japanese TV drama mode: bundled editorial list of 15 titles graded by listening difficulty, with no external catalog key required.
- Local resource search over public Nyaa metadata, narrowed by season and sorted for browser-playable releases, handing a verified `magnet:` link to a downloader the user already has.

### Media

- Local `.mp4` / `.mkv` with Japanese `.srt` / `.ass`; MKV remuxed for browser playback when needed, embedded Japanese subtitle tracks extracted automatically.
- Watched media folder imports new files once they stop changing, with periodic reconciliation as a fallback.
- Optional Jimaku subtitle matching: choose the entry once, and the rest of the series downloads automatically.

### Review

- Save words and sentences with their source line and timestamp.
- One-click export to a `tanku Anime` Anki deck over AnkiConnect, skipping duplicates.

### Setup

- `npm start` runs an environment check first: it stops with install guidance when the Node.js major version is not 22, and warns when `ffmpeg` or `ffprobe` is missing.
- `npm run setup:jmdict` downloads, extracts, and imports the Japanese dictionary in one command.
- A single sentence handed to an AI coding agent can perform the whole installation; see `docs/AI-SETUP.md`.

### Known limits

- macOS is fully verified with real media. Windows has cross-platform CI and a verified clean install and startup, but media playback on physical Windows hardware is unconfirmed.
- API keys are stored in plain text in the local SQLite database. Do not expose the server to an untrusted network.
- Sources that browsers still cannot play, such as H.264 10-bit, are flagged rather than transcoded.

[0.1.0]: https://github.com/DanielDcool/tankuanime/releases/tag/v0.1.0
[Unreleased]: https://github.com/DanielDcool/tankuanime/compare/v0.1.0...HEAD
