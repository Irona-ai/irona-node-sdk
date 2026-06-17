import type { LLMGatewayCostData } from '../responseTypes';

import { applyResponseReasoningTransform } from './gatewayResponseTransforms';
import { logger } from './logger';
import type { OpenRouterExtraBody } from './openRouterMapper';

export type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } }
  | { type: 'video_url'; video_url: { url: string }; filename?: string }
  | { type: string; [key: string]: unknown };

/**
 * A user message in OpenRouter-native format.
 */
export interface OpenRouterUserMessage {
  role: 'user';
  content: string | OpenRouterContentPart[];
}

/**
 * Creates a custom fetch wrapper for OpenRouter that:
 * 1. Merges OpenRouter-specific params (`reasoning`, `plugins`, `provider`)
 *    into the JSON body of POST requests.
 * 2. When `openRouterUserMessages` is provided, replaces user messages in the
 *    outgoing request body with the pre-built OpenRouter-native versions. This
 *    is used to inject `video_url` content parts that the Vercel AI SDK does
 *    not natively understand.
 * 3. When reasoning is active (`extraBody.reasoning` is set), injects
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
 *
 * 4. When `onCost` is provided, surfaces OpenRouter's ground-truth cost
 *    (`usage.cost` / `usage.cost_details`, always included in the final stream
 *    chunk) via the same callback the LLM Gateway wrapper uses — so consumers
 *    receive a single `llmgateway-cost` part regardless of which gateway served
 *    the request.
 */
export function createOpenRouterFetchWrapper(
  extraBody: OpenRouterExtraBody,
  baseFetch: typeof globalThis.fetch = globalThis.fetch,
  openRouterUserMessages?: OpenRouterUserMessage[],
  onCost?: (data: LLMGatewayCostData) => void
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

    const merged: Record<string, unknown> = { ...parsed, ...extraBody };

    // When pre-built OpenRouter-format user messages are provided (e.g. for
    // video_url parts), replace only the user-role messages in the body.
    // Non-user messages (system, assistant, tool) come from the Vercel AI SDK
    // serialisation, which is already correct for those roles.
    if (
      openRouterUserMessages !== undefined &&
      openRouterUserMessages.length > 0 &&
      Array.isArray(merged.messages)
    ) {
      let userIdx = 0;
      merged.messages = (merged.messages as Array<Record<string, unknown>>).map(
        msg => {
          if (msg['role'] === 'user') {
            const override = openRouterUserMessages[userIdx];
            userIdx++;
            return override ?? msg;
          }
          return msg;
        }
      );
      if (userIdx !== openRouterUserMessages.length) {
        logger.warn(
          `[openRouterFetchWrapper] User message count mismatch: expected ${openRouterUserMessages.length}, replaced ${userIdx}`
        );
      }
    }

    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify(merged),
    });

    return applyResponseReasoningTransform(response, injectReasoning, onCost);
  };
}
