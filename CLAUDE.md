# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build
```bash
npm run build
```
Builds the SDK using microbundle, outputs to `dist/` directory.

### Development
```bash
npm run devsdk
```
Runs microbundle in watch mode for SDK development.

### Start Server
```bash
npm run dev
```
Runs the development server with ts-node-dev.

### Testing
```bash
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

Tests are organized in `tests/` directory:
- `unit/completions/` - Completion functionality tests split by scenario
- `mocks/` - Centralized mock definitions for dependencies
- `utils/` - Shared test utilities and helpers
- See `tests/README.md` for detailed testing guidelines

## Architecture

### Core Components

**IronaAI** (`src/index.ts`): Main entry point and SDK class that:
- Validates API keys (expects `IRONAAI_API_KEY` env var or config)
- Loads supported models from external Gist URL
- Provides `modelSelect()` and `completions.create()` APIs
- Uses factory pattern with async initialization

**IronaRouterClient** (`src/irona-router-client/`): Handles model selection logic:
- Validates request payloads against Zod schemas
- Filters models based on media type support (images, PDFs)
- Calls Irona's routing API to select optimal model
- Returns fallback providers on error

**IronaChatClient** (`src/irona-chat-client/`): Manages LLM interactions:
- Converts messages to Vercel AI SDK format
- Handles streaming and non-streaming completions
- Implements retry logic with fallback models
- Supports multiple providers (OpenAI, Anthropic, Google, Mistral, Perplexity, TogetherAI)
- Manages web search grounding for Google and OpenAI

### Key Design Patterns

- **Model Routing**: Dynamically selects best LLM based on criteria (cost, latency, performance)
- **Fallback Chain**: Attempts primary model, then fallbacks in sequence
- **Media Support Filtering**: Validates models support required media types before routing
- **Provider Abstraction**: Uses Vercel AI SDK for unified interface across providers

### Configuration

- API keys loaded from environment variables (`IRONAAI_API_KEY`, `OPENAI_API_KEY`, etc.)
- Supported models fetched from external Gist (configurable via `SUPPORTED_MODELS_URL`)
- Base URL configurable, defaults to production API

### Error Handling

Custom error classes in `src/errors.ts`:
- `MissingApiKeyError`: Invalid or missing API keys
- `BadRequestError`: Schema validation failures
- All methods include retry logic with detailed error messages