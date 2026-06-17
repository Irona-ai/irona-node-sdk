# Changelog

All notable changes to `ironlabs` (previously `ironlabsai`, originally `ironaai`) are documented here. This project loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## 2.1.0 — 2026-06-17

### Added: OpenRouter ground-truth cost

OpenRouter now reports per-request cost (`usage.cost` / `usage.cost_details`) in the final stream chunk, but it was being dropped — only the LLM Gateway fetch wrapper forwarded cost to consumers. The OpenRouter fetch wrapper now accepts the same `onCost` callback and surfaces the cost under the existing `llmgateway-cost` stream part, so consumers receive ground-truth cost through **one** mechanism regardless of which gateway (OpenRouter or LLM Gateway) served the request.

## 2.0.0 — 2026-06-15

### ⚠️ Breaking: package renamed again

The package has been renamed from **`ironlabsai`** (v1.0.0, two days ago) to its final name **`ironlabs`**.

```bash
# Migrate:
npm uninstall ironlabsai     # or: npm uninstall ironaai
npm install ironlabs
```

Both `ironaai` and `ironlabsai` on npm are deprecated and will no longer receive updates — install `ironlabs` going forward. The double-rename is acknowledged churn; `ironlabs` is the final brand-aligned name.

### Changed

- **Package name** `ironlabsai` → `ironlabs`.
- **New canonical export** `IronLabs` (matches package name). `IronlabsAI` and `IronaAI` remain as deprecated re-export aliases.
- **Environment variable** primary is now `IRONLABS_API_KEY`. Fallback chain: `IRONLABS_API_KEY → IRONLABS_AI_API_KEY → IRONAAI_API_KEY`. The two older names log a one-time deprecation warning when used.

### Unchanged

- All gateway, routing, completions, and video-input behavior from 0.0.30 and 1.0.0 is preserved.
- Public API surface (`completions.create()`, `modelSelect()`, config schema) is unchanged.

### Release notes

- **`ironlabsai`** (v1.0.0) deprecated: `npm deprecate ironlabsai "Package renamed to ironlabs. Run: npm i ironlabs"`.
- **`ironaai`** (original) remains deprecated with the same redirect message.

---

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

## 0.0.30 — 2026-06-11

### Added

- **`video_url` input support** — user messages now accept `video_url` parts (`{ type: 'video_url', video_url: { url }, filename? }`). When an OpenRouter API key is configured, video parts are automatically routed through OpenRouter. When only an LLM Gateway is configured (without `OPENROUTER_API_KEY`), the SDK raises a `BadRequestError` with a clear message ([ENG-541](https://github.com/Irona-ai/irona-node-sdk/pull/85), [#91](https://github.com/Irona-ai/irona-node-sdk/pull/91)).
- **`VideoUrlPartSchema`** — added to the Zod user-message schema for runtime validation of `video_url` parts. `video_url.url` is validated with `z.string().url()`.
- **`buildOpenRouterUserMessages` converter** (`src/utils/openRouterMessageConverter.ts`) — new module that converts SDK-internal `MessagePayload[]` to OpenRouter-native content-part arrays. Handles `text`, `image_url`, `image` (binary → `data:<mime>;base64,` URI), `file`, `document`, and `video_url` parts. Only user-role messages are converted; system/assistant/tool messages come from the Vercel AI SDK adapter unchanged.
- **OpenRouter fetch-wrapper user-message override** — `createOpenRouterFetchWrapper` now accepts an optional `openRouterUserMessages` parameter. When provided, it replaces the user messages in the outgoing request body with the pre-built OpenRouter-native versions. This is the mechanism that injects `video_url` content parts that the Vercel AI SDK does not natively serialise.
- **Per-media-type routing log** — routing decisions for images, PDFs, and videos are now logged individually (e.g. `Images: OpenRouter, PDFs: LLM Gateway, Videos: OpenRouter (forced)`) instead of a single combined message.
- **`video` capability** added to `doesModelSupportMediaTypes` — the media-type guard now recognises `"video"` alongside `"image"` and `"pdf"`.

### Fixed

- **PDF routing regression** — when an LLM Gateway was configured, all file media (images and PDFs) was previously routed through OpenRouter, breaking PDF-through-gateway support. PDFs now prefer LLM Gateway when one is configured; images continue to route through OpenRouter when `OPENROUTER_API_KEY` is set ([#91](https://github.com/Irona-ai/irona-node-sdk/pull/91)).
- **Image routing preservation** — fixed a regression introduced alongside PDF support where images would incorrectly bypass OpenRouter when LLM Gateway was present. Images now always route through OpenRouter when `OPENROUTER_API_KEY` is available, regardless of gateway configuration.
- **Citation stream handling for `@ai-sdk/openai` ≥ 2.0.97** — `normalizeAnnotations` in `gatewayResponseTransforms` now outputs the nested `{ type, url_citation: { url, title, start_index, end_index } }` shape that the newer AI SDK version requires. Previously it emitted the flat shape the SDK no longer accepts. Both flat (Gemini/LLM Gateway) and already-nested (OpenRouter) input formats are handled.
- **Binary image MIME type** — `buildOpenRouterUserMessages` wraps raw base64 image data in a `data:<mime>;base64,` URI. Previously a `Buffer`/`Uint8Array` image part produced a bare base64 string that OpenRouter rejected.
- **Duplicate `openRouterFallbackKey` variable** — removed a stray `process.env.OPENROUTER_API_KEY` local that shadowed the instance field and caused a TypeScript compile error.
- **`hasVideoParts` computed once** — eliminated a redundant `resolvedMessages.some(…)` scan inside `invokeChatCompletions`; `hasVideoParts` is now computed once at the top of `completions()` and threaded through `invokeChatCompletions` and `retryViaOpenRouter`.

### Changed

- **Smart per-media-type routing** — routing logic is now split across three independent flags (`useOpenRouterForImages`, `useOpenRouterForPdfs`, `forceVideoThroughOpenRouter`) instead of a single `useOpenRouterFallback` boolean. This makes it possible for images and PDFs to route differently in the same request.
- **`video` format removed from schema** — the `{ type: 'video', video: <url> }` content part (distinct from `video_url`) was removed from the message schema after review; only `video_url` is supported in this release.
- **`isLLMGatewayGateway()` renamed to `isLLMGateway()`** — internal method rename for clarity.
- **`hasFileParts` flag scope** — `hasFileParts` is still computed (as `fileMediaTypes.length > 0`) but individual `hasImageParts`, `hasPdfParts`, `hasVideoParts` booleans are now derived from it for finer-grained routing decisions.

### Release notes

- **Published using:** the granular npm access token + temporary scoped `.npmrc` method documented in [README → Publish Package to npm → Option A](./README.md#option-a-preferred-manual-publish-with-a-granular-npm-token). Same approach as 0.0.28 and 0.0.29.
- **Branch sync:** `development` was merged into `main` before publish, per the policy in [`CLAUDE.md`](./CLAUDE.md).

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
