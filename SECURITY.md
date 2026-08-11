# Security Policy

## Supported versions

tanku Anime has not made a tagged release yet. Security fixes are made on the current default branch (`master`); please update to its latest commit before reporting an issue.

## Reporting a vulnerability

Please do **not** open a public issue for a suspected vulnerability. Use GitHub's private [security advisory form](https://github.com/DanielDcool/tankuanime/security/advisories/new) instead. Include:

- the affected commit or version;
- a minimal, non-destructive reproduction;
- impact and any prerequisites; and
- a suggested fix, if you have one.

Do not include API keys, media files, private filenames, SQLite databases, or other personal data. The maintainer will acknowledge the report and coordinate a fix or disclosure through the private advisory.

## Local threat model and current limitations

- The development server binds to `127.0.0.1` by default. Browser CORS is limited to the local web origins by default; additional exact origins must be opted into with `CORS_ORIGINS`. For a remote web client, prefer one public origin with `/api` reverse-proxied to the loopback-only server. This allowlist is not authentication: do not expose the API to an untrusted network without adding HTTPS, authentication, and per-user data isolation.
- API keys entered in Settings are currently stored in plaintext in the local SQLite database. Anyone who can read that database can read those keys. A system credential-store migration is tracked as a pre-promotion task.
- Personal media, subtitles, viewing progress, vocabulary, mappings, and AI explanation cache are local data. Keep the data directory out of source control and backups you do not trust.
- The application connects to optional third-party services only after users configure them or request a catalog/resource action. Treat data returned by external sources as untrusted.

## Out of scope

The project does not operate a video-hosting, downloader, or account service. Reports about a third-party media source, downloader, or AI provider should be sent to that provider unless they demonstrate a vulnerability in tanku Anime itself.
