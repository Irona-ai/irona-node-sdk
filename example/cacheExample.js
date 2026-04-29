const { IronaAI } = require('../src/index');

/**
 * Demonstrates LLM Gateway prompt caching with the Irona SDK.
 *
 * Prerequisites (LLM Gateway dashboard):
 *  1. Organization settings → Data Retention → "Retain All Data"
 *  2. Project settings → Preferences → Caching → ON
 *  3. Set a TTL (e.g. 3600 seconds for 1 hour)
 *
 * The gateway handles caching server-side — no extra API parameters needed.
 * The SDK surfaces `cached: true` on non-streaming responses when the
 * gateway returns usage.totalTokens === 0 (a cache hit).
 *
 * Best practices for maximum cache hit rate:
 *  - Use temperature: 0 for deterministic/factual tasks
 *  - Enable normalizeForCache to strip trailing punctuation and extra whitespace
 *    so "What is Paris?" and "What is Paris" share the same cache key
 *  - Keep timestamps out of system prompts
 *  - Put stable instructions in the system role, variable input in user role
 */
async function runCacheDemo() {
  const sdkClient = await IronaAI.createInstance({
    gateway: {
      baseUrl: process.env.LLM_GATEWAY_BASE_URL,
      apiKey: process.env.LLM_GATEWAY_API_KEY,
      // Trim whitespace, collapse spaces, strip trailing punctuation
      // so minor formatting differences don't bust the cache key
      normalizeForCache: true,
    },
  });

  const body = {
    models: ['openai/gpt-4o-mini'],
    messages: [
      {
        role: 'system',
        content: 'You are a helpful geography assistant. Be concise.',
      },
      {
        role: 'user',
        content: 'What is the capital of France',
      },
    ],
    temperature: 0,
    stream: false,
  };

  console.log('[cacheExample] Sending first request (expect cache miss)...');
  const first = await sdkClient.completions.create(body);
  console.log(`[cacheExample] cached: ${first.cached}`);
  console.log(`[cacheExample] response: ${first.response.content}\n`);

  console.log('[cacheExample] Sending identical request (expect cache hit)...');
  const second = await sdkClient.completions.create(body);
  console.log(`[cacheExample] cached: ${second.cached}`);
  console.log(`[cacheExample] response: ${second.response.content}\n`);

  // Normalization in action: this variant differs only in trailing punctuation
  // and extra whitespace — normalizeForCache makes it match the cached key
  const bodyVariant = {
    ...body,
    messages: [
      body.messages[0],
      { role: 'user', content: '  What is the capital of France?  ' },
    ],
  };
  console.log(
    '[cacheExample] Sending normalized variant (expect cache hit)...'
  );
  const third = await sdkClient.completions.create(bodyVariant);
  console.log(`[cacheExample] cached: ${third.cached}`);
  console.log(`[cacheExample] response: ${third.response.content}\n`);
}

runCacheDemo().catch(err => {
  console.error('[cacheExample] Error:', err);
  process.exit(1);
});
