# OpenRouter Gateway Payload Mapping

When an OpenRouter gateway is configured, the SDK maps its native options to OpenRouter's API format via a custom `fetch` wrapper. This document describes the mappings.

## Reasoning Effort

The SDK's `reasoning_effort` field maps to OpenRouter's `reasoning` body parameter:

| SDK `reasoning_effort` | OpenRouter `reasoning`              |
| ---------------------- | ----------------------------------- |
| `undefined`            | _(omitted — no reasoning key sent)_ |
| `'off'`                | `{ enabled: false }`                |
| `'low'`                | `{ effort: 'low' }`                 |
| `'medium'`             | `{ effort: 'medium' }`              |
| `'high'`               | `{ effort: 'high' }`                |
| `'max'`                | `{ effort: 'xhigh' }`               |

## Web Search

The SDK's `search` boolean maps to OpenRouter's plugin system:

| SDK `search`                               | OpenRouter               |
| ------------------------------------------ | ------------------------ |
| `undefined` / `false`                      | _(omitted)_              |
| `true` (model supports search)             | `plugins: [{id: 'web'}]` |
| `true` (model does **not** support search) | _(omitted)_              |

## How It Works

1. `buildOpenRouterExtraBody()` in `src/utils/openRouterMapper.ts` produces a merged extra-body object (or `undefined` if no features are requested).
2. When extra params exist, `createOpenRouterFetchWrapper()` in `src/utils/openRouterFetchWrapper.ts` creates a custom `fetch` that intercepts POST requests and merges the extra keys into the JSON body.
3. A per-request `createOpenAI()` instance is created with the custom fetch, rather than mutating the singleton gateway provider.

## Non-OpenRouter Gateways

These mappings only apply when the gateway hostname is `openrouter.ai` or `*.openrouter.ai`. All other gateways are unaffected.

## Source Files

- `src/utils/openRouterMapper.ts` — Pure mapper functions
- `src/utils/openRouterFetchWrapper.ts` — Custom fetch wrapper
- `src/irona-chat-client/IronaChatClient.ts` — Integration point
