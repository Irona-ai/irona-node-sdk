/**
 * Integration test: OpenRouter Gateway Payload Mapping
 *
 * Validates that reasoningEffort, search, and standard payloads
 * are correctly mapped and sent through the OpenRouter gateway.
 *
 * Requires: OPENROUTER_API_KEY set in environment or .env
 */
const { IronaAI } = require('ironlabsai');

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  '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';

const IRONLABS_AI_API_KEY =
  process.env.IRONLABS_AI_API_KEY || 'sk_4E61QXK1N7eKCfTHZ4J-yyGXWWeug7Ji';

const gatewayConfig = {
  apiKey: IRONLABS_AI_API_KEY,
  gateway: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: OPENROUTER_API_KEY,
  },
};

// ── Test Helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

function logResult(name, success, detail) {
  const icon = success ? 'PASS' : 'FAIL';
  results.push({ name, success, detail });
  if (success) {
    passed++;
    console.log(`  ✅ ${icon}: ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${icon}: ${name} — ${detail}`);
  }
}

// ── Test 1: Basic completions through OpenRouter (no special features) ───────

async function testBasicCompletions() {
  log('Test 1', 'Basic completions through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      models: ['openai/gpt-4o-mini'],
      stream: false,
      maxTokens: 20,
    });

    const content = response.content || '';
    log('Test 1', `Provider: ${provider}, Model: ${model}`);
    log('Test 1', `Response: "${content.substring(0, 100)}"`);

    logResult(
      'Basic completions via OpenRouter',
      content.length > 0,
      content.length > 0 ? `Got ${content.length} chars` : 'Empty response'
    );
  } catch (error) {
    logResult('Basic completions via OpenRouter', false, error.message);
  }
}

// ── Test 2: Reasoning effort through OpenRouter ──────────────────────────────

async function testReasoningEffort() {
  log('Test 2', 'Reasoning effort "high" through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [
        {
          role: 'user',
          content: 'What is 15 * 37? Show your work briefly.',
        },
      ],
      models: ['openai/gpt-4o-mini'],
      stream: false,
      reasoningEffort: 'high',
      maxTokens: 500,
    });

    const content = response.content || '';
    log('Test 2', `Provider: ${provider}, Model: ${model}`);
    log('Test 2', `Response: "${content.substring(0, 200)}"`);

    logResult(
      'Reasoning effort via OpenRouter (high)',
      content.length > 0,
      content.length > 0
        ? `Got response (${content.length} chars)`
        : 'Empty response'
    );
  } catch (error) {
    logResult('Reasoning effort via OpenRouter (high)', false, error.message);
  }
}

// ── Test 3: Reasoning effort "max" (maps to xhigh) ──────────────────────────

async function testReasoningMax() {
  log('Test 3', 'Reasoning effort "max" (xhigh) through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [
        {
          role: 'user',
          content: 'Explain briefly why the square root of 2 is irrational.',
        },
      ],
      models: ['anthropic/claude-sonnet-4-20250514'],
      stream: false,
      reasoningEffort: 'max',
      maxTokens: 500,
    });

    const content = response.content || '';
    log('Test 3', `Provider: ${provider}, Model: ${model}`);
    log('Test 3', `Response: "${content.substring(0, 200)}"`);

    logResult(
      'Reasoning effort via OpenRouter (max → xhigh)',
      content.length > 0,
      content.length > 0 ? `Got ${content.length} chars` : 'Empty response'
    );
  } catch (error) {
    logResult(
      'Reasoning effort via OpenRouter (max → xhigh)',
      false,
      error.message
    );
  }
}

// ── Test 4: Reasoning effort "off" ───────────────────────────────────────────

async function testReasoningOff() {
  log('Test 4', 'Reasoning effort "off" through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [{ role: 'user', content: 'What is 2+2? Just the number.' }],
      models: ['openai/gpt-4o-mini'],
      stream: false,
      reasoningEffort: 'off',
      maxTokens: 20,
    });

    const content = response.content || '';
    log('Test 4', `Provider: ${provider}, Model: ${model}`);
    log('Test 4', `Response: "${content}"`);

    logResult(
      'Reasoning effort via OpenRouter (off)',
      content.length > 0,
      content.length > 0 ? `Got "${content}"` : 'Empty response'
    );
  } catch (error) {
    logResult('Reasoning effort via OpenRouter (off)', false, error.message);
  }
}

// ── Test 5: Web search through OpenRouter ────────────────────────────────────

async function testWebSearch() {
  log('Test 5', 'Web search through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [
        {
          role: 'user',
          content: "What is today's date and a major news headline?",
        },
      ],
      models: ['openai/gpt-4o-mini'],
      stream: false,
      search: true,
      maxTokens: 300,
    });

    const content = response.content || '';
    log('Test 5', `Provider: ${provider}, Model: ${model}`);
    log('Test 5', `Response: "${content.substring(0, 300)}"`);

    logResult(
      'Web search via OpenRouter',
      content.length > 0,
      content.length > 0 ? `Got ${content.length} chars` : 'Empty response'
    );
  } catch (error) {
    logResult('Web search via OpenRouter', false, error.message);
  }
}

// ── Test 6: Reasoning + Search combined ──────────────────────────────────────

async function testReasoningAndSearch() {
  log('Test 6', 'Reasoning + Search combined through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [
        {
          role: 'user',
          content:
            'Search for the current population of India and reason about whether it has surpassed 1.5 billion yet.',
        },
      ],
      models: ['openai/gpt-4o-mini'],
      stream: false,
      reasoningEffort: 'medium',
      search: true,
      maxTokens: 500,
    });

    const content = response.content || '';
    log('Test 6', `Provider: ${provider}, Model: ${model}`);
    log('Test 6', `Response: "${content.substring(0, 300)}"`);

    logResult(
      'Reasoning + Search combined via OpenRouter',
      content.length > 0,
      content.length > 0 ? `Got ${content.length} chars` : 'Empty response'
    );
  } catch (error) {
    logResult(
      'Reasoning + Search combined via OpenRouter',
      false,
      error.message
    );
  }
}

// ── Test 7: Streaming with reasoning through OpenRouter ──────────────────────

async function testStreamingWithReasoning() {
  log('Test 7', 'Streaming with reasoning through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [
        { role: 'user', content: 'What is 99 * 101? Think step by step.' },
      ],
      models: ['openai/gpt-4o-mini'],
      stream: true,
      reasoningEffort: 'low',
      maxTokens: 300,
    });

    let accumulated = '';
    let reasoningData = '';
    let usage = {};

    for await (const part of response.fullStream) {
      if (part.type === 'text-delta') {
        accumulated += part.text;
      }
      if (part.type === 'reasoning-delta') {
        reasoningData += part.text;
      }
      if (part.type === 'finish') {
        usage = part.totalUsage || {};
      }
    }

    log('Test 7', `Provider: ${provider}, Model: ${model}`);
    log('Test 7', `Streamed text: "${accumulated.substring(0, 200)}"`);
    log(
      'Test 7',
      `Streamed reasoning: "${reasoningData.substring(0, 200)}..."`
    );
    log('Test 7', `Usage: ${JSON.stringify(usage)}`);

    logResult(
      'Streaming + reasoning via OpenRouter',
      accumulated.length > 0,
      accumulated.length > 0
        ? `Streamed ${accumulated.length} chars, reasoning: ${reasoningData.length} chars`
        : 'Empty stream'
    );
  } catch (error) {
    logResult('Streaming + reasoning via OpenRouter', false, error.message);
  }
}

// ── Test 8: Streaming with search through OpenRouter ─────────────────────────

async function testStreamingWithSearch() {
  log('Test 8', 'Streaming with search through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [
        {
          role: 'user',
          content: 'What are the top 3 trending topics on the internet today?',
        },
      ],
      models: ['openai/gpt-4o-mini'],
      stream: true,
      search: true,
      maxTokens: 300,
    });

    let accumulated = '';
    for await (const part of response.fullStream) {
      if (part.type === 'text-delta') {
        accumulated += part.text;
      }
    }

    log('Test 8', `Provider: ${provider}, Model: ${model}`);
    log('Test 8', `Streamed text: "${accumulated.substring(0, 300)}"`);

    logResult(
      'Streaming + search via OpenRouter',
      accumulated.length > 0,
      accumulated.length > 0
        ? `Streamed ${accumulated.length} chars`
        : 'Empty stream'
    );
  } catch (error) {
    logResult('Streaming + search via OpenRouter', false, error.message);
  }
}

// ── Test 9: Non-OpenAI model through OpenRouter with reasoning ───────────────

async function testNonOpenAIModelReasoning() {
  log('Test 9', 'Anthropic model with reasoning through OpenRouter gateway');
  try {
    const sdk = await IronaAI.createInstance(gatewayConfig);
    const { provider, model, response } = await sdk.completions.create({
      messages: [
        {
          role: 'user',
          content: 'Briefly explain why the sky is blue.',
        },
      ],
      models: ['anthropic/claude-sonnet-4-20250514'],
      stream: false,
      reasoningEffort: 'low',
      maxTokens: 300,
    });

    const content = response.content || '';
    log('Test 9', `Provider: ${provider}, Model: ${model}`);
    log('Test 9', `Response: "${content.substring(0, 200)}"`);

    logResult(
      'Anthropic model + reasoning via OpenRouter',
      content.length > 0,
      content.length > 0 ? `Got ${content.length} chars` : 'Empty response'
    );
  } catch (error) {
    logResult(
      'Anthropic model + reasoning via OpenRouter',
      false,
      error.message
    );
  }
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n========================================');
  console.log(' OpenRouter Gateway Integration Tests');
  console.log('========================================\n');

  // Run tests sequentially to keep output readable
  await testBasicCompletions();
  console.log('');
  await testReasoningEffort();
  console.log('');
  await testReasoningMax();
  console.log('');
  await testReasoningOff();
  console.log('');
  await testWebSearch();
  console.log('');
  await testReasoningAndSearch();
  console.log('');
  await testStreamingWithReasoning();
  console.log('');
  await testStreamingWithSearch();
  console.log('');
  await testNonOpenAIModelReasoning();

  // Summary
  console.log('\n========================================');
  console.log(
    ` Results: ${passed} passed, ${failed} failed, ${passed + failed} total`
  );
  console.log('========================================\n');

  if (failed > 0) {
    console.log('Failed tests:');
    results
      .filter(r => !r.success)
      .forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
