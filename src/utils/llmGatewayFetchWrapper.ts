import { applyResponseReasoningTransform } from './gatewayResponseTransforms';
import type { LLMGatewayExtraBody } from './llmGatewayMapper';

/**
 * Creates a custom fetch wrapper for LLM Gateway (api.llmgateway.io) that:
 * 1. Merges LLM Gateway-specific params (`reasoning`, `web_search`) into the
 *    JSON body of POST requests.
 * 2. Cleans up `delta.reasoning` tokens from streaming/non-streaming responses
 *    — when reasoning is active, injects them as `<think>…</think>` tags so
 *    `extractReasoningMiddleware({ tagName: 'think' })` can extract them; when
 *    reasoning is off, drops them so they never leak into text content.
 *
 * The transform is always applied because some models emit `delta.reasoning`
 * unconditionally even when reasoning was not requested.
 */
export function createLLMGatewayFetchWrapper(
  extraBody: LLMGatewayExtraBody,
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  // Reasoning injection is active only when a reasoning config is present
  // (mapper omits the field entirely for 'off'/undefined).
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
