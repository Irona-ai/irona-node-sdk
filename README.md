# IronLabs Node SDK

This library provides convenient access to IronLabs' model-routing API from TypeScript or JavaScript.
We help you select the best AI model for your specific use case, optimizing for factors like cost, latency, or performance.

Installation

```bash
npm install ironlabs
```

> **Migrating from `ironaai` or `ironlabsai`?** The package was renamed to **`ironlabs`** in v2.0.0. Update your install and imports — your existing API key keeps working (the SDK accepts `IRONLABS_API_KEY`, `IRONLABS_AI_API_KEY`, and `IRONAAI_API_KEY`).

## Quick Start

To use the API, you need to sign up for a IronaAI account & obtain an API key. Sign up [here](https://app.ironlabs.ai/).

## Basic Usage

Here's a simple example of how to use IronaAI's model-routing to select the best model between GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro, while optimizing for latency and outputting the raw text:

```typescript
import { IronLabs } from 'ironlabs';
// Legacy aliases also exported: IronlabsAI, IronaAI

const client = new IronLabs({
  // Optional - automatically loads from environment variable
  apiKey: process.env.IRONLABS_API_KEY,
});

async function basicExample() {
  // 1. Select the best model
  const result = await client.completions.create({
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

IronaAI works with any OpenAI-compatible gateway. When a gateway is configured, all LLM calls route through it instead of individual provider APIs — no provider-specific API keys needed.

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
import { IronaAI } from 'ironaai';

const ironaAI = await IronaAI.createInstance({
  apiKey: process.env.IRONAAI_API_KEY,
  gateway: {
    baseUrl: 'https://router.requesty.ai/v1',
    apiKey: process.env.LLM_GATEWAY_API_KEY!,
  },
});
```

**OpenRouter with optional headers**:

```typescript
const ironaAI = await IronaAI.createInstance({
  apiKey: process.env.IRONAAI_API_KEY,
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

`npm run build && npm link && cd example && npm link ironlabsai`

and

For published versions we can use the following:

`npm install ironlabsai` # in this case sdk must be published by `npm publish`

Ref [blog link](https://medium.com/@oresoftware/node-js-how-to-test-your-new-npm-module-without-publishing-it-every-5-minutes-3b6f8e0491dd).

### Publish Package to npm

**Preferred method: manual publish with a granular npm access token.** The interactive `npm login` + 2FA OTP path is fragile (the OTP prompt fails for accounts whose 2FA mode is "auth and writes" or when the authenticator app isn't available), and the CI publish workflow has historically failed due to npm-version / OIDC setup gaps. Use a granular token until those paths are fixed.

> **Branch sync requirement:** Per [`CLAUDE.md`](./CLAUDE.md), `development` and `main` must be in sync before publishing — open a `development` → `main` PR (or merge) as part of every release. Publish from `main`.

#### Option A (Preferred): Manual publish with a granular npm token

1. **Create the token (one-time):**
   - Go to [npmjs.com → Access Tokens → Generate New Token → Granular](https://www.npmjs.com/settings/~/tokens).
   - Permissions: `Read and write`. Scope: package `ironaai` (or limit to the org). Expiration: set a reasonable bound (e.g., 90 days).
   - Granular tokens bypass 2FA, so the OTP prompt is not triggered.

2. **Sync branches and check out `main`:**

   ```bash
   git checkout main && git pull origin main
   ```

   Verify `package.json` version is the one you intend to publish.

3. **Build:**

   ```bash
   npm ci && npm run build
   ```

4. **Dry-run to verify the tarball contents:**

   ```bash
   npm publish --dry-run
   ```

5. **Publish via a scoped temporary `.npmrc`** (avoids touching `~/.npmrc`):

   ```bash
   export NPM_TOKEN=<paste_your_granular_token>
   umask 077
   printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > /tmp/publish-npmrc
   npm publish --userconfig /tmp/publish-npmrc --access public --tag latest
   rm -f /tmp/publish-npmrc
   unset NPM_TOKEN
   ```

6. **Verify:**

   ```bash
   npm view ironaai version          # should print the new version
   npm view ironaai dist-tags        # latest should match
   ```

7. **Rotate the token** if it was ever pasted into a shared terminal, screenshot, or chat transcript.

#### Option B (Legacy): `npm login` + OTP

Only works if your npm account's 2FA mode is set to "Authorization only" (not "Authorization and writes") and you have access to your authenticator app.

```bash
npm login            # complete 2FA in browser/terminal
npm run build
npm publish --dry-run
npm publish --otp=<6-digit-code>
```

If `npm publish` prompts for an OTP and you can't supply one, fall back to Option A.

#### Option C (Currently broken): OIDC trusted publishing via GitHub Actions

The `.github/workflows/publish.yml` workflow is wired for npm OIDC trusted publishing, but every run on record has failed with `ENEEDAUTH`. Known gaps:

- The runner's bundled npm (10.x with Node 22) is below the `>= 11.5.1` required for OIDC trusted publishing — the workflow does **not** install a newer npm.
- The npm trusted-publisher binding (org `Irona-ai`, repo `irona-node-sdk`, workflow `publish.yml`) must be configured on [npmjs.com/package/ironaai/access](https://www.npmjs.com/package/ironaai/access). Verify before relying on it.

Do not use this path until those are fixed. PRs welcome.

#### Troubleshooting

- **`EOTP` / "operation requires a one-time password"** — your token is a classic/legacy token, or you're using `npm login` with 2FA mode set to "auth and writes". Switch to a granular token (Option A) or change the 2FA mode on npmjs.com.
- **`ENEEDAUTH` / "need auth"** — no valid credentials. Re-check `NPM_TOKEN`, or that the token still has write access to `ironaai`.
- **`E403` / "You cannot publish over the previously published version"** — bump the version in `package.json` and rebuild before retrying.
- **`--provenance` errors locally** — `--provenance` only works inside supported CI (e.g., GitHub Actions). Omit it for local manual publishes.
- **`repository.url`** in `package.json` must exactly match the GitHub repo URL (case-sensitive) — required if you ever do get OIDC + provenance working.

## Key Concepts

- models: An array of AI providers and models you want LLM-Routing to be done from.
- tradeoff: The factor to optimize for (e.g., 'latency', 'cost', 'performance').

- **Error Handling**
  IronaAI uses typed responses. If there's an error, the response will have a `error` property with the error message. Always check for this property when handling responses.

Picks up pricing from env variable if available from `SUPPORTED_MODELS_URL`

## Support

If you encounter any issues or have questions, please open an issue on our GitHub repository or email us at support@ironlabs.ai.

## License

This library is released under the MIT License.
