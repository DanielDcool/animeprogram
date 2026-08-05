# Contributing to Kotoba Anime

Thanks for considering a contribution. Kotoba Anime is a local-first Japanese learning player, so the best changes remove a real step of learning friction: finding a suitable show, understanding one missed line, or reviewing it later.

## Before you start

1. Read [README.md](README.md) and [AGENTS.md](AGENTS.md).
2. Search existing issues before proposing a large feature.
3. Discuss changes that add a new external service, downloader control, account system, or media lifecycle management before implementing them.

## Local development

```bash
npm ci
npm test
npm start
```

Use Node.js 22+ and FFmpeg. See [docs/AI-SETUP.md](docs/AI-SETUP.md) for local-data and credential boundaries.

## Pull requests

- Keep each pull request focused and explain the learning problem it solves.
- Add or update tests for pure logic, parser, routing, and state-machine changes.
- Run `npm test`; run `npm run build -w web` for front-end changes.
- Verify UI changes in a real browser.
- Do not commit media, SQLite data, dictionary dumps, generated build files, API keys, tokens, cookies, or personal information.
- Update `README.md` for installation or user-facing changes, and `docs/DEVELOPMENT.md` for implementation status or decisions.
- When installation, user-facing behavior, privacy, or legal wording changes, update all three README files in the same pull request: `README.md`, `README.zh-CN.md`, and `README.ja.md`.
- Report a potential vulnerability privately as described in [SECURITY.md](SECURITY.md), rather than opening a public issue.

## Scope

The project intentionally does not run a downloader, host video, proxy BitTorrent traffic, or manage remote media. Proposals in those areas need a maintainer discussion before implementation.
