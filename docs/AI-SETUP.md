# AI-assisted local setup

This guide is for a coding agent helping someone install or work on tanku Anime locally. It is also useful as a checklist for a human maintainer.

## Start with one sentence

Users should not need to clone the repository first or repeat a long setup checklist. This one sentence is enough:

> Install and start tanku Anime from https://github.com/DanielDcool/animeprogram on this computer.

The agent must read `AGENTS.md`, `README.md`, and this guide before acting. Those files, rather than the user's prompt, define the safety boundaries and verification work. macOS has full manual verification. Windows has a cross-platform start command and automated coverage, but a new Windows installation must still be verified on that computer before it is described as working.

## Goal and boundaries

Set up the application without exposing secrets, modifying personal media, adding downloads, or making Git changes unless the user asks explicitly.

- Treat `MEDIA_DIR`, the SQLite data directory, and API keys as personal local data.
- Never print, copy, commit, or send an API key, token, cookie, or private media filename.
- Do not add a magnet download task or manage the user's downloader. The app only hands off a link when the user clicks one.
- Do not overwrite existing media, subtitles, `server/data/`, or uncommitted repository changes.

## Setup sequence

1. If the repository is not present, clone `https://github.com/DanielDcool/animeprogram.git`. Then read the root `AGENTS.md` and `README.md` before changing anything.
2. Inspect the repository status and identify the operating system and CPU architecture.
3. Verify Node.js and both FFmpeg executables before dependency installation:

   ```bash
   node --version
   npm --version
   ffmpeg -version
   ffprobe -version
   ```

   Node must be 22.x. Do not treat a moving "LTS" package alias as equivalent: on the verified Windows machine, `OpenJS.NodeJS.LTS` installed Node 24, which forced `better-sqlite3` to fall back to a local C++ build. Use the official [Node.js 22 download](https://nodejs.org/en/download) or an exact major-version workflow. With a user-approved WinGet setup, one option is to install `Schniz.fnm`, initialize it in the current PowerShell process, then run `fnm install 22` and `fnm use 22`. The repository's `.node-version` also records the required major version. Verify `node --version` again before running npm.

   On Windows, both `ffmpeg.exe` and `ffprobe.exe` must resolve from `PATH`. If Node or FFmpeg is missing, ask before installing system software or changing persistent `PATH`. Use a Windows build linked by the [official FFmpeg download page](https://ffmpeg.org/download.html), or a package manager the user already trusts.
4. Install the locked project dependencies on macOS, Windows, or Linux with:

   ```bash
   npm ci
   ```

   The locked `better-sqlite3` version has Node 22 Windows x64 and arm64 prebuilds. If `npm ci` tries to compile it or fails on a native build, verify that the active process is really using Node 22 before considering any compiler. Report the exact non-sensitive error; do not install Visual Studio Build Tools or upgrade the package without confirmation.
5. Run `npm test` and `npm run build -w web`. These checks must pass on a fresh installation.
6. Start both processes with the same command on every supported operating system:

   ```bash
   npm start
   ```

7. Verify all of the following before reporting success:
   - `http://127.0.0.1:3001/api/health` returns `{"ok":true}`.
   - `http://localhost:5173` loads tanku Anime.
   - The browser console has no startup error.
   - The library page loads without modifying or importing media the user did not place in the configured media directory.
8. Only test the player with media the user has already authorized for this purpose. Prefer an H.264 8-bit sample on Windows. HEVC playback varies by Windows version, hardware, installed extensions, and browser, so the app intentionally marks H.265 as potentially needing conversion outside the verified macOS path.
9. Ask before installing missing system software, changing environment variables outside the current shell, writing outside the repository, or changing the user's downloader configuration.

## Optional components

| Need | Required action |
| --- | --- |
| Local word definitions | With the user's consent for the download, the agent may run `npm run setup:jmdict`, which fetches a verified JMdict Simplified release (CC BY-SA 4.0, EDRDG data) and imports it. Manual fallback: the user downloads JMdict Simplified, extracts it to `server/vendor/jmdict-eng.json`, then the agent runs `npm run import-jmdict -w server`. |
| One-click Anki export | Requires the Anki desktop app and AnkiConnect add-on code `2055492159`. Installing the add-on and restarting Anki require user confirmation. Keep Anki running during export and keep AnkiConnect bound to its default `127.0.0.1:8765`; do not expose it to the network. |
| AI explanation | The user enters a provider API key in the application's Settings page. Do not request the key in chat or write it to files. |
| Jimaku subtitle matching | The user supplies their own Jimaku API key in Settings and chooses a first mapping. |
| Different storage locations | The user can save an absolute media path in Settings and restart the app. `MEDIA_DIR` overrides that saved path for the current process. Set `DATA_DIR` only for the current process unless the user authorizes a persistent system change. |
| Magnet handoff | Requires a magnet-capable desktop downloader registered with the OS. Installation and save-folder changes require confirmation. Point its save folder at the configured media directory only if the user wants automatic pickup. |

## Windows-specific checks

- Use PowerShell or Command Prompt; do not assume Bash, `&`, `wait`, `export`, or Unix path syntax. The repository's `npm start` script is shell-independent.
- After installing Node through WinGet or `fnm`, refresh or explicitly initialize the current PowerShell environment before checking `node --version`; a newly installed executable may not appear in an already-running shell.
- The default media directory is `%USERPROFILE%\AnimeLibrary`. It can be edited in Settings and takes effect after restart. For a temporary PowerShell override, use `$env:MEDIA_DIR = "$HOME\Videos\TankuAnime"` before `npm start`; this environment variable has priority over the saved setting.
- The app invokes `ffmpeg` and `ffprobe` without a shell, so paths containing spaces are supported as long as the executables are on `PATH`.
- `fs.watch` is only a wake-up signal. A periodic full reconciliation remains active if Windows stops the directory watcher.
- A missing downloader affects only magnet handoff. It must not block catalog browsing, local playback, subtitles, dictionary use, or AI explanations.

## Repository conventions

- Server code is in `server/`; browser code is in `web/`.
- Keep all browser API calls in `web/src/api.ts`.
- Keep learning-mode behavior in `web/src/player/learningMode.ts` and add tests for pure state logic.
- Preserve the current visual design tokens in `web/src/index.css`.
- Update `docs/DEVELOPMENT.md` after a product or implementation change; update `README.md` when installation or user-facing behavior changes.
- Do not create a commit, push, pull request, release, or external account action unless the user explicitly requests it.

## Useful commands

```bash
npm start
npm test
npm run build -w web
npm run verify:start
npm run setup:jmdict
npm run import-jmdict -w server
```

If setup fails, report the command, the non-sensitive error, and the smallest safe next action. Do not work around a missing permission or security control without the user's approval.
