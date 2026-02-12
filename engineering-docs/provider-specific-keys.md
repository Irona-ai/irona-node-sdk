# Provider-Specific Keys

## Overview

Previously, gateway routing was all-or-nothing: when a gateway (e.g., OpenRouter) was configured, ALL models routed through it. This change makes the routing decision per-provider.

**Three auto-detected modes:**

| Configuration             | Behavior                                               |
| ------------------------- | ------------------------------------------------------ |
| No gateway key            | All direct (need individual provider keys)             |
| Gateway key only          | All via gateway                                        |
| Gateway + provider key(s) | Providers with keys go direct; rest go through gateway |

**Precedence:** Programmatic `config.providers` > environment variables > gateway

## Files Changed

| File                                       | Change                                                              |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `src/types.ts`                             | Added `ProviderConfig` type, added `providers?` field to `Config`   |
| `src/irona-chat-client/IronaChatClient.ts` | Core routing logic changes (see below)                              |
| `.env.example`                             | Documented auto-detection behavior                                  |
| `tests/unit/completions/gateway.test.ts`   | Updated gateway test + 2 new bypass tests (env var + programmatic)  |

## Key Implementation Details

### New type: `ProviderConfig`

```typescript
export type ProviderConfig = {
  apiKey: string;
  baseUrl?: string; // optional custom endpoint
};

// Added to Config:
providers?: Partial<Record<string, ProviderConfig>>;
```

### Core logic change: per-provider `isUsingGateway`

In `invokeChatCompletions()`, the single most important change:

```typescript
// Before: global — gateway routes ALL models
const isUsingGateway = this.gatewayProvider !== undefined;

// After: per-provider — gateway only routes models without direct keys
const isUsingGateway =
  this.gatewayProvider !== undefined && !this.hasDirectProviderKey(provider);
```

### New method: `hasDirectProviderKey()`

Checks if a provider has a direct API key available from either:

1. Programmatic `config.providers[provider].apiKey`
2. Environment variable (e.g., `OPENAI_API_KEY`)

```typescript
private hasDirectProviderKey(provider: string): boolean {
  const providerConf = this.config.providers?.[provider];
  if (providerConf?.apiKey !== undefined && providerConf.apiKey !== '') return true;
  const envKeyName = providerApiKeyName(provider);
  if (envKeyName === undefined) return false;
  const envVal = process.env[envKeyName];
  return envVal !== undefined && envVal !== '';
}
```

### New method: `createCustomProviderInstance()`

When a provider has programmatic config (apiKey/baseUrl), creates a custom Vercel SDK instance instead of using the default import. Uses a switch statement over all 7 providers:

```typescript
switch (provider) {
  case 'openai':
    return createOpenAI(opts);
  case 'anthropic':
    return createAnthropic(opts);
  case 'google':
    return createGoogleGenerativeAI(opts);
  case 'mistral':
    return createMistral(opts);
  case 'perplexity':
    return createPerplexity(opts);
  case 'togetherai':
    return createTogetherAI(opts);
  case 'xai':
    return createXai(opts);
  default:
    return undefined;
}
```

This avoids mutating `process.env` — each provider gets its own SDK instance with the key baked in.

### Updated: `loadApiKeyForProvider()`

Checks programmatic config before falling back to env vars:

```typescript
const providerConf = this.config.providers?.[provider];
if (providerConf?.apiKey !== undefined && providerConf.apiKey !== '') {
  return providerConf.apiKey; // programmatic key takes priority
}
// ... existing env var logic unchanged
```

### Updated: `getModelInstance()`

Added a check for programmatic provider config before falling through to default Vercel SDK imports. If a custom instance exists, it's used (including reasoning middleware wrapping).

## Why Downstream Code Works Unchanged

All provider-specific features are gated on the `isUsingGateway` boolean:

- **Web search**: Google/xAI search tools only added when `!isUsingGateway`
- **Reasoning config**: Applied when `!isUsingGateway`
- **Model name resolution**: Gateway model name mapping only when `isUsingGateway`
- **TogetherAI prefix**: Added only when `!isUsingGateway`

Since `isUsingGateway` is now `false` for providers with direct keys, all these features automatically work correctly for direct-routed providers.

## Test Changes

### Updated test: "uses OpenRouter model mapping when available and no provider key is set"

- Renamed to clarify: "...when available and no provider key is set"
- Now explicitly deletes `GOOGLE_API_KEY` before testing pure-gateway behavior

### New test: "bypasses gateway for providers with direct API keys"

- Sets up gateway + `GOOGLE_API_KEY` in env
- Verifies the model name is the raw model name (direct) not the OpenRouter identifier

### New test: "bypasses gateway when programmatic providers config has apiKey"

- Sets up gateway + programmatic `providers: { openai: { apiKey: '...' } }`
- Deletes `OPENAI_API_KEY` env var to prove programmatic config is sufficient
- Verifies the model name is raw (direct routing), not gateway-prefixed

## Usage Example

```typescript
const irona = await IronaAI.createInstance({
  apiKey: process.env.IRONAAI_API_KEY,
  gateway: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
  },
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY! },
    xai: { apiKey: process.env.XAI_API_KEY! },
  },
});

// OpenAI → direct (custom SDK instance with baked-in key)
// xAI → direct (custom SDK instance with baked-in key)
// Anthropic → OpenRouter gateway (no direct key)
// Google → OpenRouter gateway (no direct key)
```

## Manual Verification

1. Set `OPENROUTER_API_KEY` + `OPENAI_API_KEY` in `.env`
2. Run a completion with `openai/gpt-4o`
3. Check logs: should show direct invocation (no gateway model name resolution)
4. Run a completion with `anthropic/claude-3-5-sonnet` (no `ANTHROPIC_API_KEY` set)
5. Check logs: should show gateway routing with OpenRouter model identifier
