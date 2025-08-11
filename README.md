# IronaAI Node SDK
This library provides convenient access to the IronaAI's model-routing API from TypeScript or JavaScript. 
We help you select the best AI model for your specific use case, optimizing for factors like cost, latency, or performance.

Installation
```bash
npm install ironaai
```

## Quick Start
To use the API, you need to sign up for a IronaAI account & obtain an API key. Sign up [here](https://app.irona.ai/).

## Basic Usage
Here's a simple example of how to use IronaAI's model-routing to select the best model between GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro, while optimizing for latency and outputting the raw text:

```typescript
import { IronaAI } from 'ironaai';

const ironaAI = new IronaAI({
  // Optional - automatically loads from environment variable
  apiKey: process.env.IRONAAI_API_KEY,
});

async function basicExample() {
  // 1. Select the best model
  const result = await ironaAI.completions.create({
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

### Build & test Instructions

For local building & testing the package without publishing on npm.

Shortcut command: `npm run eg-test`
This does the following things in 1 go:

```
npm run build 
npm link  # soft link for local for ironaai package.
cd example // go to run scripts
npm link ironaai // linked local package is installed for use now. (equivalent to `npm install ironaai` for local testing)
```
and

For published versions we can use the following:

`npm install ironaai` # in this case sdk must be published by `npm publish`

Ref [blog link](https://medium.com/@oresoftware/node-js-how-to-test-your-new-npm-module-without-publishing-it-every-5-minutes-3b6f8e0491dd). 

### Publish package to NPM Instructions

1. update the version in package.json
2. npm run build
3. npm login
4. npm publish

## Key Concepts
* models: An array of AI providers and models you want LLM-Routing to be done from. 
* tradeoff: The factor to optimize for (e.g., 'latency', 'cost', 'performance').

* **Error Handling**
IronaAI uses typed responses. If there's an error, the response will have a `error` property with the error message. Always check for this property when handling responses. 

Picks up pricing from env variable if available from `SUPPORTED_MODELS_URL`

## Support
If you encounter any issues or have questions, please open an issue on our GitHub repository or email us at support@irona.ai.

## License
This library is released under the MIT License.
