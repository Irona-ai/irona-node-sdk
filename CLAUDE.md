# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Branching

**Always create new feature/fix branches from `development`:**

```bash
git checkout development && git pull && git checkout -b feat/my-feature
```

PRs should target `development`. The `main` branch is production-only.

## Commands

### Build

```bash
npm run build
```

Builds the SDK using microbundle, outputs CJS/ESM/UMD to `dist/`.

### Development

```bash
npm run devsdk    # Watch mode for SDK development (microbundle)
npm run dev       # Development server (ts-node-dev)
```

### Testing

```bash
npm test                              # Run all tests
npm test -- single-model.test.ts      # Run specific test file
npm test -- --testNamePattern="pattern" # Run tests matching name
npm run test:watch -- single-model.test.ts  # Watch specific file
npm run test:coverage                 # Coverage report
```

### Linting & Formatting (MANDATORY)

**IMPORTANT: Every PR runs ESLint, Prettier, and TypeScript type-check in CI. You MUST run these before committing ANY code changes. Lint failures block merge.**

```bash
npm run lint          # ESLint — must pass with zero errors
npm run format:check  # Prettier — must pass with zero errors
npm run type-check    # TypeScript — must pass with zero errors
```

To auto-fix most issues:

```bash
npm run lint:fix      # Auto-fix ESLint errors (import order, quotes, etc.)
npm run format:write  # Auto-fix Prettier formatting
npm run clean         # Runs both lint:fix + format:write
```

**Key rules enforced by ESLint (see `eslint.config.js`):**

- `prettier/prettier` — single quotes, trailing commas, 2-space indent, no semicolons omitted
- `@typescript-eslint/strict-boolean-expressions` — never use nullable strings/booleans in conditionals; always check explicitly (e.g., `x !== undefined && x !== ''` instead of `if (x)`)
- `@typescript-eslint/prefer-nullish-coalescing` — use `??` instead of `||`
- `@typescript-eslint/consistent-type-imports` — use `import type` for type-only imports
- `@typescript-eslint/no-explicit-any` — no `any`; use `Record<string, unknown>` or proper types
- `import/order` — imports must be alphabetized and grouped (builtin → external → internal → parent → sibling)
- `unused-imports/no-unused-imports` — remove all unused imports
- `no-console` — use `logger` from `src/utils/logger.ts` instead of `console.log`

**Workflow: After writing/editing code, ALWAYS run `npm run clean` then `npm run type-check` before staging.**

### Local Integration Testing

```bash
npm run eg-test   # Builds, links locally, and tests without publishing
```

## Architecture

### Core Components

**IronaAI** (`src/index.ts`): Main SDK export. Uses async factory pattern — must be instantiated via `IronaAI.createInstance(config)`, not `new`. Validates API key (must start with `sk_`), loads supported models from external Gist (with retries), resolves optional gateway config. Exposes `modelSelect()` and `completions.create()`.

**IronaRouterClient** (`src/irona-router-client/`): Calls Irona's routing API to select the optimal model based on criteria (cost, latency, performance). Validates payloads with Zod schemas, filters models by media type support (images, PDFs), returns fallback providers on error.

**IronaChatClient** (`src/irona-chat-client/IronaChatClient.ts`): Executes LLM calls via Vercel AI SDK. Handles streaming/non-streaming completions, retry logic with fallback chain, web search grounding (Google, OpenAI), reasoning effort config, and function calling/tools. Supports providers: OpenAI, Anthropic, Google, Mistral, Perplexity, TogetherAI, xAI.

### Gateway Support

Optional OpenAI-compatible gateway routing (e.g., OpenRouter). When configured, all LLM calls route through a single gateway endpoint instead of individual provider APIs. Config resolved from `config.gateway` object or env vars (`LLM_GATEWAY_*` / `OPENROUTER_*`).

### Key Patterns

- **Factory initialization**: `IronaAI.createInstance()` — async, loads model data before construction
- **Fallback chain**: Primary model → fallbacks in sequence on failure
- **Media filtering**: Models validated for required media type support before routing
- **Provider abstraction**: Vercel AI SDK (`ai` package) as unified interface across all providers
- **Path aliases**: `@/*` maps to `src/*` (configured in tsconfig.json)

### Validation

Zod schemas in `src/schemas/` validate all request payloads:

- `completions.schema.ts` — completions requests
- `modelSelect.schema.ts` — model selection requests
- `common.schema.ts` — shared types (messages, media)

### Error Classes (`src/errors.ts`)

- `MissingApiKeyError` — invalid or missing API keys
- `BadRequestError` — schema validation failures
- `UnsupportedModelError` — unsupported model requested

## Testing

Framework: Jest with ts-jest. Config in `jest.config.js`.

**Critical rule**: Mocks MUST be imported before source code in test files:

```typescript
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';
// Then import source code
```

Test helpers in `tests/utils/test-helpers.ts`: `createTestPayload()`, `createMultiModelPayload()`, `setupTestEnv()`, `mockConsole()`.

Mock utilities provide pre-configured scenarios — see `tests/README.md` for full API.

## Environment Variables

Required: `IRONAAI_API_KEY` (must start with `sk_`)

Provider keys (optional, one per provider used): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`, `PPLX_API_KEY`, `TOGETHER_API_KEY`

Gateway (optional): `LLM_GATEWAY_BASE_URL`, `LLM_GATEWAY_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`

See `.env.example` for complete list.
