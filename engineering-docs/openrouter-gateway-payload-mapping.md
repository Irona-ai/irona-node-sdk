# LLMGateway Payload Mapping

## Overview

When the SDK routes through LLMGateway (`api.llmgateway.io`), advanced features are translated from SDK-native options into LLMGateway's API format via a custom `fetch` wrapper.

**What works through LLMGateway:**

| Feature            | Status                                                       |
| ------------------ | ------------------------------------------------------------ |
| Reasoning effort   | Mapped to `reasoning` body param                             |
| Web search         | Mapped to `plugins: [{id: 'web'}]`                           |
| Model names        | Bare names (no `provider/` prefix)                           |
| Streaming + above  | Both work in streaming and non-streaming modes               |
| Non-LLMGateway GWs | Completely unaffected (hostname check gates all mappings)    |

## Files Changed

| File                                        | Change                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `src/utils/llmGatewayMapper.ts`             | Mapper functions (migrated from openRouterMapper.ts)           |
| `src/utils/llmGatewayFetchWrapper.ts`       | Custom fetch wrapper (migrated from openRouterFetchWrapper.ts) |
| `src/irona-chat-client/IronaChatClient.ts`  | Wires up mapper + fetch wrapper; forces `.chat` API on gateway |
| `src/supported_models.ts`                   | Renamed `openrouter_identifier` → `llmgateway_identifier`      |
| `src/index.ts`                              | Auto-detects `LLM_GATEWAY_API_KEY` → `api.llmgateway.io/v1`   |
| `docs/openrouter-mapping.md`                | Updated user-facing mapping reference                          |

## Key Technical Decisions

### Why a custom `fetch` wrapper?

The SDK uses `@ai-sdk/openai`'s `createOpenAI()` for the gateway provider. The OpenAI chat model's `getArgs()` constructs the request body from known OpenAI fields only — there is no `extraBody` passthrough or `providerOptions` mapping for custom keys like `reasoning` or `plugins`.

The **only viable injection point** is the `fetch` option on `createOpenAI()`:

```
createOpenAI({fetch}) → OpenAIChatLanguageModel({fetch}) → postJsonToApi({fetch})
  → postToApi({fetch}) → fetch(url, {method: "POST", body: JSON.stringify(args)})
```

The wrapper intercepts POST requests, parses the JSON body, merges LLMGateway-specific params, and forwards to the real `fetch`.

### Why `.chat` on the gateway provider?

`@ai-sdk/openai` v2.0.32 defaults to the **Responses API** (`/responses` endpoint). LLMGateway only supports the **Chat Completions API** (`/chat/completions`).

```typescript
// Explicitly uses Chat Completions API
return createOpenAI({ baseURL, apiKey, headers, name }).chat;
```

### Why bare model names?

LLMGateway uses model names without provider prefixes (e.g., `gemini-2.0-flash-001` not `google/gemini-2.0-flash-001`). The `isLLMGatewayGateway()` check gates the lookup of `llmgateway_identifier` from provider metadata. If no identifier is found, the bare model name is used as-is.

### Why the fetch wrapper is always created

The transform is always applied — even with an empty extra body — to clean up `delta.reasoning` tokens that models can emit unconditionally (even without a reasoning request). Without cleanup, these tokens would leak into the text-delta stream parts.

## Implementation Details

### Mapper functions (`llmGatewayMapper.ts`)

**Reasoning effort mapping:**

| SDK `reasoning_effort` | LLMGateway `reasoning`              |
| ---------------------- | ----------------------------------- |
| `undefined`            | _(omitted)_                         |
| `'off'`                | _(omitted)_                         |
| `'low'`                | `{ effort: 'low' }`                 |
| `'medium'`             | `{ effort: 'medium' }`              |
| `'high'`               | `{ effort: 'high' }`                |
| `'max'`                | `{ effort: 'xhigh' }`               |

**Search mapping:**

| SDK `search`                               | LLMGateway               |
| ------------------------------------------ | ------------------------ |
| `undefined` / `false`                      | _(omitted)_              |
| `true` (model supports search)             | `plugins: [{id: 'web'}]` |
| `true` (model does **not** support search) | _(omitted)_              |

`buildLLMGatewayExtraBody()` returns `{}` when no features are requested. The fetch wrapper is still created (for reasoning cleanup) even with an empty body.

### LLMGateway hostname detection

Matches only the exact LLMGateway hostname:

```typescript
private isLLMGatewayGateway(): boolean {
  return this.gatewayHostname === 'api.llmgateway.io';
}
```

### Auto-detection from environment

Setting `LLM_GATEWAY_API_KEY` without `LLM_GATEWAY_BASE_URL` automatically resolves to `https://api.llmgateway.io/v1`:

```typescript
const llmGatewayApiKey = process.env.LLM_GATEWAY_API_KEY;
const defaultLLMGatewayBaseUrl =
  llmGatewayApiKey !== undefined && llmGatewayApiKey !== ''
    ? 'https://api.llmgateway.io/v1'
    : undefined;
```

## Gotchas and Lessons Learned

1. **`@ai-sdk/openai` defaults to Responses API** — Always use `.chat` for gateways.

2. **Per-request provider instances are necessary** — The custom fetch wrapper contains request-specific data (the extra body). A singleton gateway provider can't carry per-request state.

3. **The native `webSearch` tool must be skipped for gateways** — LLMGateway handles search at the API level via `plugins`. The existing `!isUsingGateway` guard prevents the native tool from being added.

## Verification

```bash
npm run clean           # lint + format
npm run type-check      # TypeScript compilation
npm test                # All unit tests pass
```
