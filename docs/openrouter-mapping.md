# LLMGateway Payload Mapping

When an LLMGateway gateway is configured (`api.llmgateway.io`), the SDK maps its native options to LLMGateway's API format via a custom `fetch` wrapper. This document describes the mappings.

## Reasoning Effort

The SDK's `reasoning_effort` field maps to the `reasoning` body parameter:

| SDK `reasoning_effort` | LLMGateway `reasoning`              |
| ---------------------- | ----------------------------------- |
| `undefined`            | _(omitted — no reasoning key sent)_ |
| `'off'`                | _(omitted)_                         |
| `'low'`                | `{ effort: 'low' }`                 |
| `'medium'`             | `{ effort: 'medium' }`              |
| `'high'`               | `{ effort: 'high' }`                |
| `'max'`                | `{ effort: 'xhigh' }`               |

## Web Search

The SDK's `search` boolean maps to the plugin system:

| SDK `search`                               | LLMGateway               |
| ------------------------------------------ | ------------------------ |
| `undefined` / `false`                      | _(omitted)_              |
| `true` (model supports search)             | `plugins: [{id: 'web'}]` |
| `true` (model does **not** support search) | _(omitted)_              |

## Model Names

LLMGateway uses bare model names without a provider prefix:

| Internal model                | LLMGateway model name  |
| ----------------------------- | ---------------------- |
| `google/gemini-2.0-flash-001` | `gemini-2.0-flash-001` |
| `openai/gpt-4o`               | `gpt-4o`               |
| `anthropic/claude-3-5-sonnet` | `claude-3-5-sonnet`    |

The `llmgateway_identifier` field in the provider metadata stores the correct bare name. If no identifier is found, the bare model name is used.

## How It Works

1. `buildLLMGatewayExtraBody()` in `src/utils/llmGatewayMapper.ts` produces a merged extra-body object.
2. `createLLMGatewayFetchWrapper()` in `src/utils/llmGatewayFetchWrapper.ts` creates a custom `fetch` that intercepts POST requests, merges the extra keys into the JSON body, and transforms streaming/non-streaming responses to handle `delta.reasoning` tokens.
3. A per-request `createOpenAI()` instance is created with the custom fetch.

## Non-LLMGateway Gateways

These mappings only apply when the gateway hostname is exactly `api.llmgateway.io`. All other gateways are unaffected.

## Environment Variables

| Variable               | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `LLM_GATEWAY_API_KEY`  | API key — also auto-sets base URL to `https://api.llmgateway.io/v1` |
| `LLM_GATEWAY_BASE_URL` | Override the gateway base URL                                       |

## Source Files

- `src/utils/llmGatewayMapper.ts` — Pure mapper functions
- `src/utils/llmGatewayFetchWrapper.ts` — Custom fetch wrapper
- `src/irona-chat-client/IronaChatClient.ts` — Integration point
