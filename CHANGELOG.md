# Changelog

All notable changes to `ironaai` are documented here. This project loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## 1.0.0 — 2026-06-13

### ⚠️ Breaking: package renamed

The package has been renamed from **`ironaai`** to **`ironlabsai`**.

```bash
# Remove old package and install the new one:
npm uninstall ironaai
npm install ironlabsai
```

The old `ironaai` package on npm is deprecated and will no longer receive updates — install `ironlabsai` going forward.

### Changed

- **Package name** `ironaai` → `ironlabsai`.
- **Primary export** `IronaAI` → `IronlabsAI`. `IronaAI` is retained as a deprecated re-export alias for backwards compatibility and will be removed in a future major version.
- **Environment variable** `IRONAAI_API_KEY` → `IRONLABS_AI_API_KEY`. The old name is still accepted as a fallback during the migration window.
- **Internal class renames** (no public API impact):
  - `IronaChatClient` → `IronlabsChatClient` (in `ironlabs-chat-client/`)
  - `IronaRouterClient` → `IronlabsRouterClient` (in `ironlabs-router-client/`)

### Unchanged

- All gateway logic introduced in 0.0.29 and 0.0.30 (smart per-media-type routing, PDF/image/video routing, citation stream fix, `detectGatewayTypeFromUrl`, `GATEWAY_BASE_URL`, etc.) is fully preserved.
- The `completions.create()` and `modelSelect()` public APIs are unchanged.
- `config.gateway`, `config.router`, and all other config fields are unchanged.

### Release notes

- **Published using:** granular npm access token + temporary scoped `.npmrc` ([README → Option A](./README.md#option-a-preferred-manual-publish-with-a-granular-npm-token)).
- **Branch sync:** `feat/rename-to-ironlabsai` rebased on `development` (0.0.30), then merged to `main`.
- **Old package deprecated:** `npm deprecate ironaai "Package renamed to ironlabsai"`.

---

## 0.0.30 — 2026-06-02

### Added

- **Video input support** — user messages now accept `video_url` (`{ type: 'video_url', video_url: { url }, filename? }`) and `video` (`{ type: 'video', video: <url> }`) content parts. Requests containing video are automatically routed through OpenRouter (`OPENROUTER_API_KEY`). When an LLM Gateway is configured, video parts bypass the gateway and go directly to OpenRouter since LLM Gateway does not support video ([ENG-541](https://github.com/Irona-ai/irona-node-sdk/pull/85)).
- `VideoUrlPartSchema` and `VideoPartSchema` added to the Zod message schema for runtime validation of video parts.

### Fixed

- **Citation stream handling** — reworked `gatewayResponseTransforms` to correctly surface citation data from gateway streaming responses.
- **Binary image MIME type in OpenRouter converter** — `buildOpenRouterUserMessages` now wraps raw base64 image data in a `data:<mime>;base64,` URI. Previously a `Buffer`/`Uint8Array` image part produced a bare base64 string that OpenRouter rejected.
- **`VideoUrlPartSchema` URL validation** — `video_url.url` is now validated with `z.string().url()`, consistent with other URL fields in the schema.
- **`VideoPartSchema` URL validation** — the `video` field is now validated with `z.string().url()`.
- **Duplicate `openRouterFallbackKey` variable** — removed a stray `process.env.OPENROUTER_API_KEY` local that shadowed the instance field and caused a TypeScript compile error.
- **Duplicate video detection** — eliminated a redundant `resolvedMessages.some(…)` scan inside `invokeChatCompletions`; `hasVideoParts` is now computed once in `completions()` and threaded through `invokeChatCompletions` and `retryViaOpenRouter`.

### Changed

- `hasFileParts` renamed to `hasMediaParts` — the variable covers images, PDFs, and video, not just file parts.
- `openRouterFallbackKey` is now resolved once at construction time and stored as a private readonly instance field, rather than being read from `process.env` on every `completions()` call.
- `isLLMGatewayGateway()` renamed to `isLLMGateway()` (internal method cleanup).

---

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
