/**
 * Example: Using OpenRouter as a gateway with the IronlabsAI SDK
 *
 * OpenRouter acts as a unified gateway to 200+ models across providers.
 * When configured, all LLM calls route through OpenRouter instead of
 * individual provider APIs — you only need one API key.
 *
 * Features demonstrated:
 *  - Basic gateway setup
 *  - Hybrid routing (gateway + direct provider keys)
 *  - Reasoning effort through gateway
 *  - Web search through gateway
 *  - Streaming through gateway
 *
 * Requires: OPENROUTER_API_KEY and IRONLABS_AI_API_KEY set in environment or .env
 */
const { IronlabsAI } = require('ironlabsai');

// ── Configuration ─────────────────────────────────────────────────────────────

// 1. All traffic through OpenRouter (simplest setup — one key for everything)
async function allThroughGateway() {
  console.log('\n=== All Traffic Through OpenRouter ===');

  const sdk = await IronlabsAI.createInstance({
    apiKey: process.env.IRONLABS_AI_API_KEY,
    gateway: {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    },
  });

  const { provider, model, response } = await sdk.completions.create({
    messages: [{ role: 'user', content: 'What is the golden ratio?' }],
    models: ['openai/gpt-4o-mini'],
    maxTokens: 200,
  });

  console.log(`Provider: ${provider}, Model: ${model}`);
  console.log(`Response: ${response.content}`);
}

// 2. Hybrid routing: some providers direct, rest through gateway
async function hybridRouting() {
  console.log('\n=== Hybrid Routing (Direct + Gateway) ===');

  const sdk = await IronlabsAI.createInstance({
    apiKey: process.env.IRONLABS_AI_API_KEY,
    gateway: {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    },
    // Providers with direct keys bypass the gateway automatically
    providers: {
      openai: { apiKey: process.env.OPENAI_API_KEY },
    },
  });

  // This routes directly to OpenAI (has direct key)
  const directResult = await sdk.completions.create({
    messages: [{ role: 'user', content: 'Say hello.' }],
    models: ['openai/gpt-4o-mini'],
    maxTokens: 20,
  });
  console.log(
    `Direct: ${directResult.provider}/${directResult.model} → "${directResult.response.content}"`
  );

  // This routes through OpenRouter (no direct Anthropic key)
  const gatewayResult = await sdk.completions.create({
    messages: [{ role: 'user', content: 'Say hello.' }],
    models: ['anthropic/claude-sonnet-4-20250514'],
    maxTokens: 20,
  });
  console.log(
    `Gateway: ${gatewayResult.provider}/${gatewayResult.model} → "${gatewayResult.response.content}"`
  );
}

// 3. Reasoning effort through OpenRouter
async function reasoningThroughGateway() {
  console.log('\n=== Reasoning Effort Through OpenRouter ===');

  const sdk = await IronlabsAI.createInstance({
    apiKey: process.env.IRONLABS_AI_API_KEY,
    gateway: {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    },
  });

  const { provider, model, response } = await sdk.completions.create({
    messages: [
      { role: 'user', content: 'What is 15 * 37? Show your work briefly.' },
    ],
    models: ['openai/gpt-4o-mini'],
    reasoningEffort: 'high',
    maxTokens: 500,
  });

  console.log(`Provider: ${provider}, Model: ${model}`);
  console.log(`Response: ${response.content}`);
  if (response.reasoningContent) {
    console.log(`Reasoning: ${JSON.stringify(response.reasoningContent)}`);
  }
}

// 4. Web search through OpenRouter
async function searchThroughGateway() {
  console.log('\n=== Web Search Through OpenRouter ===');

  const sdk = await IronlabsAI.createInstance({
    apiKey: process.env.IRONLABS_AI_API_KEY,
    gateway: {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    },
  });

  const { provider, model, response } = await sdk.completions.create({
    messages: [{ role: 'user', content: "What is today's top news headline?" }],
    models: ['openai/gpt-4o-mini'],
    search: true,
    maxTokens: 300,
  });

  console.log(`Provider: ${provider}, Model: ${model}`);
  console.log(`Response: ${response.content}`);
}

// 5. Streaming through OpenRouter
async function streamingThroughGateway() {
  console.log('\n=== Streaming Through OpenRouter ===');

  const sdk = await IronlabsAI.createInstance({
    apiKey: process.env.IRONLABS_AI_API_KEY,
    gateway: {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    },
  });

  const { provider, model, response } = await sdk.completions.create({
    messages: [{ role: 'user', content: 'Count from 1 to 5 slowly.' }],
    models: ['openai/gpt-4o-mini'],
    stream: true,
    maxTokens: 100,
  });

  console.log(`Provider: ${provider}, Model: ${model}`);
  process.stdout.write('Streaming: ');
  let usage = {};
  for await (const part of response.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
    if (part.type === 'finish') {
      usage = part.totalUsage || {};
    }
  }
  console.log(`\nUsage: ${JSON.stringify(usage)}`);
}

// 6. Multi-model selection with fallbacks through gateway
async function multiModelWithFallbacks() {
  console.log('\n=== Multi-Model + Fallbacks Through OpenRouter ===');

  const sdk = await IronlabsAI.createInstance({
    apiKey: process.env.IRONLABS_AI_API_KEY,
    gateway: {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    },
  });

  const { provider, model, response } = await sdk.completions.create({
    messages: [{ role: 'user', content: 'Explain quantum computing briefly.' }],
    models: [
      'openai/gpt-4o-mini',
      'anthropic/claude-sonnet-4-20250514',
      'google/gemini-2.0-flash',
    ],
    fallbackModels: ['openai/gpt-4o-mini'],
    maxTokens: 300,
  });

  console.log(`Selected: ${provider}/${model}`);
  console.log(`Response: ${response.content}`);
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================');
  console.log(' OpenRouter Gateway Examples');
  console.log('========================================');

  try {
    await allThroughGateway();
    await hybridRouting();
    await reasoningThroughGateway();
    await searchThroughGateway();
    await streamingThroughGateway();
    await multiModelWithFallbacks();

    console.log('\n=== All examples completed ===');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
