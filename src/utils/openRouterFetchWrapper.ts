import { applyResponseReasoningTransform } from './gatewayResponseTransforms';
import type { OpenRouterExtraBody } from './openRouterMapper';

/**
 * Creates a custom fetch wrapper for OpenRouter that:
 * 1. Merges OpenRouter-specific params (`reasoning`, `plugins`, `provider`)
 *    into the JSON body of POST requests.
 * 2. When reasoning is active (`extraBody.reasoning` is set), injects
 *    `delta.reasoning` as `<think>…</think>` tags so
 *    `extractReasoningMiddleware({ tagName: 'think' })` can extract them.
 *    When reasoning is off, drops `delta.reasoning` entirely so those tokens
 *    never appear in the response text.
 *
 * `url_citation` annotation normalisation is intentionally absent: `@ai-sdk/openai`
 * ≥ 2.0.97 natively parses OpenRouter's nested format into `{type:"source"}` parts.
 *
 * The transform is always applied so that `delta.reasoning` is always cleaned
 * up — models like gpt-5-nano emit it unconditionally even without a reasoning
 * request, which would otherwise cause tokens to leak into text-delta parts.
 */
export function createOpenRouterFetchWrapper(
  extraBody: OpenRouterExtraBody,
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  // Reasoning injection is active only when a reasoning config is present
  // (mapper omits the field entirely for 'off'/undefined)
  const injectReasoning = extraBody.reasoning !== undefined;

  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (
      init?.method?.toUpperCase() !== 'POST' ||
      typeof init.body !== 'string'
    ) {
      return baseFetch(input, init);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return baseFetch(input, init);
    }

    const merged = { ...parsed, ...extraBody };

    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify(merged),
    });

    return applyResponseReasoningTransform(response, injectReasoning);
  };
}
