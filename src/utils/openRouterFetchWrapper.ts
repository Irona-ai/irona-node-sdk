import type { OpenRouterExtraBody } from './openRouterMapper';

/**
 * Creates a custom fetch wrapper that merges OpenRouter-specific params
 * into the JSON body of outgoing POST requests.
 *
 * Non-POST requests and requests without a JSON body pass through unchanged.
 */
export function createOpenRouterFetchWrapper(
  extraBody: OpenRouterExtraBody,
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
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
      // Not valid JSON — pass through as-is
      return baseFetch(input, init);
    }

    const merged = { ...parsed, ...extraBody };

    return baseFetch(input, {
      ...init,
      body: JSON.stringify(merged),
    });
  };
}
