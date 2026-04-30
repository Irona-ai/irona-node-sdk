# IronlabsAI Node SDK

This library provides convenient access to the IronlabsAI's model-routing API from TypeScript or JavaScript.
We help you select the best AI model for your specific use case, optimizing for factors like cost, latency, or performance.

Installation

```bash
npm install ironlabsai
```

## Quick Start

To use the API, you need to sign up for a IronlabsAI account & obtain an API key. Sign up [here](https://app.irona.ai/).

## Basic Usage

Here's a simple example of how to use IronlabsAI's model-routing to select the best model between GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro, while optimizing for latency and outputting the raw text:

```typescript
import { IronlabsAI } from 'ironlabsai';

const IronlabsAI = new IronlabsAI({
  // Optional - automatically loads from environment variable
  apiKey: process.env.IRONLABS_AI_API_KEY,
});

async function basicExample() {
  // 1. Select the best model
  const result = await IronlabsAI.completions.create({
    // Define the user's message
    messages: [{ content: 'What is the golden ratio?', role: 'user' }],
    // Specify the LLM providers and models to choose from
    llmProviders: [
      { provider: 'openai', model: 'gpt-4o-2024-05-13' },
      { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' },
      { provider: 'google', model: 'gemini-1.5-pro-latest' },
    ],
    // Set the optimization criteria to latency
    tradeoff: 'latency',
  });

  // 2. Handle potential errors
  if ('error' in result) {
    console.error('Error:', result.error);
    return;
  }

  // 3. Log the results
  // Display the text response
  console.log('LLM output:', result.content);
  // Display the selected provider(s)
  console.log('Selected providers:', result.providers);
}

basicExample();
```

## Gateway Support

IronlabsAI works with any OpenAI-compatible gateway. When a gateway is configured, all LLM calls route through it instead of individual provider APIs — no provider-specific API keys needed.

### Supported Gateways

| Gateway                              | Base URL                        | Model format     | `includeProviderInModelName` |
| ------------------------------------ | ------------------------------- | ---------------- | ---------------------------- |
| [OpenRouter](https://openrouter.ai)  | `https://openrouter.ai/api/v1`  | `provider/model` | `true` (default)             |
| [Requesty](https://requesty.ai)      | `https://router.requesty.ai/v1` | `provider/model` | `true` (default)             |
| [LLM Gateway](https://llmgateway.io) | `https://api.llmgateway.io/v1`  | raw model name   | `false`                      |

Any other OpenAI-compatible gateway works the same way — just set the base URL and API key.

### Configuration

**Via environment variables** (simplest):

```bash
LLM_GATEWAY_BASE_URL='https://router.requesty.ai/v1'
LLM_GATEWAY_API_KEY='your-gateway-api-key'
LLM_GATEWAY_INCLUDE_PROVIDER_IN_MODEL_NAME='true'  # set 'false' for gateways that expect raw model names
```

**Via config object**:

```typescript
import { IronlabsAI } from 'ironlabsai';

const IronlabsAI = await IronlabsAI.createInstance({
  apiKey: process.env.IRONLABS_AI_API_KEY,
  gateway: {
    baseUrl: 'https://router.requesty.ai/v1',
    apiKey: process.env.LLM_GATEWAY_API_KEY!,
  },
});
```

**OpenRouter with optional headers**:

```typescript
const IronlabsAI = await IronlabsAI.createInstance({
  apiKey: process.env.IRONLABS_AI_API_KEY,
  gateway: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
    headers: {
      'HTTP-Referer': 'https://your-app.example',
      'X-Title': 'Your App Name',
    },
  },
});
```

### Notes

- If `gateway` is set, provider-specific API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) are not required.
- If `gateway` is not set, the SDK uses provider-specific API keys as before.
- OpenRouter-specific env fallbacks are also supported: `OPENROUTER_BASE_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`.
- Model name format:
  - `LLM_GATEWAY_INCLUDE_PROVIDER_IN_MODEL_NAME=true` (default) — sends `openai/gpt-4o-mini` (works for OpenRouter, Requesty)
  - `LLM_GATEWAY_INCLUDE_PROVIDER_IN_MODEL_NAME=false` — sends `gpt-4o-mini` (works for LLM Gateway and gateways expecting raw model names)

### Build & test Instructions

For local building & testing the package without publishing on npm.

Shortcut command: `npm run eg-test`
This does the following things in 1 go:

```
npm run build
npm link  # soft link for local for IronlabsAI package.
cd example // go to run scripts
npm link ironlabsai // linked local package is installed for use now. (equivalent to `npm install ironlabsai` for local testing)
```

and

For published versions we can use the following:

`npm install ironlabsai` # in this case sdk must be published by `npm publish`

Ref [blog link](https://medium.com/@oresoftware/node-js-how-to-test-your-new-npm-module-without-publishing-it-every-5-minutes-3b6f8e0491dd).

### Publish Package to npm

Publishing uses **OIDC trusted publishing** — no npm tokens are needed. The GitHub Actions workflow authenticates directly with npm via OpenID Connect.

#### Prerequisites (one-time setup)

- **npm trusted publisher** configured on [npmjs.com/package/ironlabsai/access](https://www.npmjs.com/package/ironlabsai/access) (GitHub org: `Irona-ai`, repo: `irona-node-sdk`, workflow: `publish.yml`, environment: `npm`)
- **GitHub environment** `npm` created in repo Settings > Environments with branch policy restricted to `main`

#### Option A: Manual publish

1. Update the version in `package.json`
2. Build the package:
   ```bash
   npm run build
   ```
3. Verify what will be published:
   ```bash
   npm publish --dry-run
   ```
4. Publish to npm (must be logged in via `npm login`):
   ```bash
   npm publish
   ```

#### Option B: Automated publish via GitHub Release

1. Update the version in `package.json`
2. Commit and push changes to `main`
3. Create a GitHub Release with tag matching the version:
   ```bash
   gh release create v0.0.23 --title "v0.0.23" --notes "Release notes here" --target main
   ```
   Or via GitHub UI: Go to Releases > "Create a new release" > Enter tag (e.g., `v0.0.23`) > Publish

The release triggers the CI workflow (`.github/workflows/publish.yml`) which builds and publishes to npm automatically with provenance.

#### Troubleshooting

- **`NODE_AUTH_TOKEN` must NOT be set** — even an empty string prevents OIDC from working. The workflow intentionally omits it.
- **`repository.url`** in `package.json` must exactly match the GitHub repo URL (case-sensitive) for provenance validation.
- **npm version** — OIDC trusted publishing requires npm >= 11.5.1. The workflow upgrades npm automatically before publishing.

## Key Concepts

- models: An array of AI providers and models you want LLM-Routing to be done from.
- tradeoff: The factor to optimize for (e.g., 'latency', 'cost', 'performance').

- **Error Handling**
  IronlabsAI uses typed responses. If there's an error, the response will have a `error` property with the error message. Always check for this property when handling responses.

Picks up pricing from env variable if available from `SUPPORTED_MODELS_URL`

## Support

If you encounter any issues or have questions, please open an issue on our GitHub repository or email us at support@irona.ai.

## License

This library is released under the MIT License.
