# OpenRouter Gateway Payload Mapping

## Overview

Previously, when the SDK routed through OpenRouter as a gateway, all advanced features were silently dropped — reasoning effort was skipped, web search was never passed, and no provider-specific options were mapped. This change translates SDK-native options into OpenRouter's API format via a custom `fetch` wrapper.

**What now works through OpenRouter gateway:**

| Feature            | Before  | After                                                     |
| ------------------ | ------- | --------------------------------------------------------- |
| Reasoning effort   | Dropped | Mapped to `reasoning` body param                          |
| Web search         | Dropped | Mapped to `plugins: [{id: 'web'}]`                        |
| Streaming + above  | N/A     | Both work in streaming and non-streaming modes            |
| Non-OpenRouter GWs | N/A     | Completely unaffected (hostname check gates all mappings) |

## Files Changed

| File                                        | Change                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `src/utils/openRouterMapper.ts`             | New — pure mapper functions                                    |
| `src/utils/openRouterFetchWrapper.ts`       | New — custom fetch wrapper with request/response interception  |
| `src/ironlabs-chat-client/IronlabsChatClient.ts`  | Wires up mapper + fetch wrapper; forces `.chat` API on gateway |
| `docs/openrouter-mapping.md`                | New — user-facing mapping reference                            |
| `tests/unit/utils/openRouterMapper.test.ts` | New — unit tests for mappers and fetch wrapper                 |
| `tests/unit/completions/gateway.test.ts`    | Added 7 OpenRouter payload mapping tests                       |
| `example/testOpenRouterGateway.js`          | New — 9 integration tests against real OpenRouter              |

## Key Technical Decisions

### Why a custom `fetch` wrapper?

The SDK uses `@ai-sdk/openai`'s `createOpenAI()` for the gateway provider. The OpenAI chat model's `getArgs()` constructs the request body from known OpenAI fields only — there is no `extraBody` passthrough or `providerOptions` mapping for custom keys like `reasoning` or `plugins`.

The **only viable injection point** is the `fetch` option on `createOpenAI()`:

```
createOpenAI({fetch}) → OpenAIChatLanguageModel({fetch}) → postJsonToApi({fetch})
  → postToApi({fetch}) → fetch(url, {method: "POST", body: JSON.stringify(args)})
```

The wrapper intercepts POST requests, parses the JSON body, merges OpenRouter-specific params, and forwards to the real `fetch`.

### Why `.chat` on the gateway provider?

`@ai-sdk/openai` v2.0.32 defaults to the **Responses API** (`/responses` endpoint). OpenRouter and most gateways only support the **Chat Completions API** (`/chat/completions`).

```typescript
// Before — uses Responses API by default (breaks on OpenRouter)
return createOpenAI({ baseURL, apiKey, headers, name });

// After — explicitly uses Chat Completions API
return createOpenAI({ baseURL, apiKey, headers, name }).chat;
```

This changes the type from `ReturnType<typeof createOpenAI>` to `ReturnType<typeof createOpenAI>['chat']`.

### Why strip `annotations` from search responses?

When the web search plugin is active, OpenRouter adds `annotations` (URL citations) to the response:

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Today is February 26...",
      "annotations": [{ "type": "url_citation", "url_citation": { ... } }]
    }
  }]
}
```

`@ai-sdk/openai` strictly validates the response schema and rejects `annotations` as an unexpected field, causing `AI_TypeValidationError` (streaming) or `AI_APICallError: Invalid JSON response` (non-streaming).

The fetch wrapper intercepts responses and strips `annotations` from both:

- **Non-streaming:** Proxies `response.body` through a `TransformStream` that buffers, strips, and re-emits
- **Streaming (SSE):** Processes each `data: {...}` line, strips annotations from the JSON, and re-emits

### Why `web_search_options` was removed

The initial plan included mapping `web_search_options: { search_context_size: 'medium' }` alongside `plugins`. Integration testing revealed that OpenRouter **forwards** `web_search_options` to the upstream provider (e.g., OpenAI), which rejects it as an invalid parameter. Only `plugins: [{id: 'web'}]` is needed.

### Why native `webSearch` tool is skipped for gateways

The OpenAI `webSearch` tool (`openai.tools.webSearch({})`) is designed for OpenAI's native Responses API. When routing through a gateway, this tool causes failures because the gateway doesn't support it. OpenRouter handles search at the API level via `plugins`, so native tools are skipped:

```typescript
// Before — always added for OpenAI + search
if (provider === 'openai' && payload.search === true && supportsWebSearch) { ... }

// After — skip for gateways (OpenRouter handles via plugins)
if (!isUsingGateway && provider === 'openai' && payload.search === true && supportsWebSearch) { ... }
```

## Implementation Details

### Mapper functions (`openRouterMapper.ts`)

Pure functions with zero side effects:

**Reasoning effort mapping:**

| SDK `reasoning_effort` | OpenRouter `reasoning`              |
| ---------------------- | ----------------------------------- |
| `undefined`            | _(omitted — no reasoning key sent)_ |
| `'off'`                | `{ enabled: false }`                |
| `'low'`                | `{ effort: 'low' }`                 |
| `'medium'`             | `{ effort: 'medium' }`              |
| `'high'`               | `{ effort: 'high' }`                |
| `'max'`                | `{ effort: 'xhigh' }`               |

**Search mapping:**

| SDK `search`                               | OpenRouter               |
| ------------------------------------------ | ------------------------ |
| `undefined` / `false`                      | _(omitted)_              |
| `true` (model supports search)             | `plugins: [{id: 'web'}]` |
| `true` (model does **not** support search) | _(omitted)_              |

`buildOpenRouterExtraBody()` returns `undefined` when no features are requested, avoiding unnecessary fetch wrapper creation.

### Wiring in IronlabsChatClient

Three additions in `invokeChatCompletions()`:

```typescript
// 1. Check if this is an OpenRouter gateway
const isOpenRouter = isUsingGateway && this.isOpenRouterGateway();

// 2. Build extra body (returns undefined if no features requested)
let openRouterExtra: OpenRouterExtraBody | undefined;
if (isOpenRouter) {
  openRouterExtra = buildOpenRouterExtraBody({
    reasoningEffort: payload.reasoning_effort,
    search: payload.search,
    supportsWebSearch,
  });
}

// 3. Get model factory (creates per-request provider with custom fetch if needed)
const modelFactory = isOpenRouter
  ? (this.getGatewayModelFactory(openRouterExtra) ?? this.getModelInstance(...))
  : this.getModelInstance(...);
```

`getGatewayModelFactory()` reuses the singleton `this.gatewayProvider` when no extra body exists, and creates a per-request `createOpenAI()` with a custom fetch wrapper when OpenRouter-specific params are needed.

### OpenRouter hostname detection

Matches both `openrouter.ai` and subdomains like `api.openrouter.ai`:

```typescript
private isOpenRouterGateway(): boolean {
  return (
    this.gatewayHostname === 'openrouter.ai' ||
    (this.gatewayHostname?.endsWith('.openrouter.ai') ?? false)
  );
}
```

## Gotchas and Lessons Learned

1. **`@ai-sdk/openai` defaults to Responses API** — Always use `.chat` for gateways. This is not OpenRouter-specific; it affects all gateway providers.

2. **OpenRouter forwards unknown body keys to upstream providers** — Don't include keys like `web_search_options` that the upstream (OpenAI, Anthropic, etc.) might reject. Only use keys that OpenRouter consumes itself.

3. **Response format differs with search plugins** — OpenRouter adds `annotations` to responses when web search is active. Any strict response parser will break. The fetch wrapper must handle both streaming and non-streaming response interception.

4. **Per-request provider instances are necessary** — The custom fetch wrapper contains request-specific data (the extra body). A singleton gateway provider can't carry per-request state, so a new `createOpenAI()` is created for each request that needs OpenRouter-specific params.

5. **The native `webSearch` tool must be skipped for gateways** — The existing code didn't gate the OpenAI search tool behind `!isUsingGateway` (Google and xAI blocks already did). This caused failures when OpenRouter received the native tool.

## Verification

```bash
npm run clean           # lint + format
npm run type-check      # TypeScript compilation
npm test                # 91 unit tests pass
node example/testOpenRouterGateway.js  # 9/9 integration tests pass
```
