# AI-assisted local setup

This guide is for a coding agent helping someone install or work on Kotoba Anime locally. It is also useful as a checklist for a human maintainer.

## Goal and boundaries

Set up the application without exposing secrets, modifying personal media, adding downloads, or making Git changes unless the user asks explicitly.

- Treat `MEDIA_DIR`, the SQLite data directory, and API keys as personal local data.
- Never print, copy, commit, or send an API key, token, cookie, or private media filename.
- Do not add a magnet download task or manage the user's downloader. The app only hands off a link when the user clicks one.
- Do not overwrite existing media, subtitles, `server/data/`, or uncommitted repository changes.

## Setup sequence

1. Read the root `README.md` and `AGENTS.md` before changing anything.
2. Inspect the repository status and confirm the operating system, Node.js version, and FFmpeg availability.
3. On the verified macOS path, install dependencies with:

   ```bash
   npm ci
   ```

4. Ask before installing missing system software, changing environment variables outside the current shell, writing outside the repository, or changing the user's downloader configuration.
5. Start the app with `npm start`, then open `http://localhost:5173`.
6. Verify the health endpoint, the library page, and the player only with media the user has already placed in `MEDIA_DIR`.
7. Run `npm test` after code changes. For UI changes, verify the affected browser path and check the browser console for errors.

## Optional components

| Need | Required action |
| --- | --- |
| Local word definitions | The user downloads JMdict Simplified, extracts it to `server/vendor/jmdict-eng.json`, then the agent may run `npm run import-jmdict -w server`. |
| AI explanation | The user enters a provider API key in the application's Settings page. Do not request the key in chat or write it to files. |
| Jimaku subtitle matching | The user supplies their own Jimaku API key in Settings and chooses a first mapping. |
| Different storage locations | Set `MEDIA_DIR` and/or `DATA_DIR` only for the current process unless the user authorizes a persistent change. |

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
npm run import-jmdict -w server
```

If setup fails, report the command, the non-sensitive error, and the smallest safe next action. Do not work around a missing permission or security control without the user's approval.
