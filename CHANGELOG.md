# Changelog

All notable changes to `ironaai` are documented here. This project loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## 0.0.29 — 2026-06-01

### Added

- Fallback gateway support for OpenRouter: automatically routes to an alternate provider when primary completion attempts are exhausted ([#86](https://github.com/Irona-ai/irona-node-sdk/pull/86)).
- Streaming error recovery: streaming requests can now switch to the fallback provider mid-stream if no content has been delivered yet, reducing partial failures.
- New configuration key to enable the fallback provider, plus a per-request override to force fallback routing.

### Release notes

- **Published using:** the granular npm access token + temporary scoped `.npmrc` method documented in [README → Publish Package to npm → Option A](./README.md#option-a-preferred-manual-publish-with-a-granular-npm-token). Same approach as 0.0.28.

## 0.0.28 — 2026-05-25

### Added

- Unified LLM gateway support: provider detection, provider-priority API keys, and legacy env-var fallbacks ([#79](https://github.com/Irona-ai/irona-node-sdk/pull/79)).
- Gateway-aware response transforms: reasoning injection/removal, streaming handling, and optional per-request cost reporting.
- Support for document and image-URL message parts in user messages.

### Fixed

- Improved media-type detection for image parts.
- SSRF hardening in the gateway request path.
- Various OpenRouter PDF and media-type extension issues.

### Docs

- Added publish-time branch sync policy to `CLAUDE.md`: `development` and `main` must be aligned before any npm publish.

### Release notes

- **Published using:** the new "granular npm access token + temporary scoped `.npmrc`" manual method described in [README → Publish Package to npm → Option A](./README.md#option-a-preferred-manual-publish-with-a-granular-npm-token).
- The CI publish workflow (`.github/workflows/publish.yml`) was attempted first but failed with `ENEEDAUTH` (same failure mode as every prior run); see README → Option C for the known gaps.
- The interactive `npm login` + OTP method also hit `EOTP` because the package's npm 2FA mode is set to "auth and writes". The granular-token path bypasses 2FA and is now the preferred manual method going forward.
