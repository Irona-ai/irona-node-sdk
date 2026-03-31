import type { OpenRouterExtraBody } from './openRouterMapper';

// ── Annotation normalisation ──────────────────────────────────────────────────

/**
 * OpenRouter nests citation fields inside a `url_citation` sub-object:
 *   { type: "url_citation", url_citation: { url, title, start_index, end_index } }
 *
 * `@ai-sdk/openai` v2 expects them flat:
 *   { type: "url_citation", url, title, start_index, end_index }
 *
 * This helper normalises an array of annotations in-place and returns whether
 * any entry was changed.
 */
function normaliseAnnotations(
  annotations: Array<Record<string, unknown>>
): boolean {
  let changed = false;

  for (const ann of annotations) {
    // Check if this annotation has a nested `url_citation` sub-object
    const nested = ann.url_citation as Record<string, unknown> | undefined;

    // Skip annotations that don't have nested citation data
    if (nested === undefined) continue;

    // Promote each field from the nested object to the top level of the annotation
    if (typeof nested.url === 'string') ann.url = nested.url;
    if (typeof nested.title === 'string') ann.title = nested.title;
    if (typeof nested.start_index === 'number')
      ann.start_index = nested.start_index;
    if (typeof nested.end_index === 'number') ann.end_index = nested.end_index;

    // Remove the now-flattened nested sub-object
    delete ann.url_citation;

    changed = true;
  }

  return changed;
}

// ── JSON transform helpers ────────────────────────────────────────────────────

/**
 * Transforms a non-streaming OpenRouter JSON response body:
 * - Normalises nested `url_citation` annotations so `@ai-sdk/openai` can parse
 *   them into `{type:"source"}` content parts.
 * - When `injectReasoning` is true, injects `message.reasoning` into
 *   `message.content` as `<think>` tags so `extractReasoningMiddleware` can
 *   separate thinking from the final answer.
 * - When `injectReasoning` is false, drops `message.reasoning` entirely so it
 *   never leaks into response content.
 */
function transformNonStreamingJson(
  json: string,
  injectReasoning: boolean
): string {
  let parsed: Record<string, unknown>;

  // Attempt to parse the raw JSON string; return as-is if it is malformed
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return json;
  }

  // `choices` is the top-level array in every OpenAI-compatible response
  const choices = parsed.choices as Array<Record<string, unknown>> | undefined;

  // Nothing to transform if there are no choices
  if (!Array.isArray(choices)) {
    return json;
  }

  let changed = false;

  for (const choice of choices) {
    const message = choice.message as Record<string, unknown> | undefined;
    if (message === undefined) continue;

    // ── Annotation normalisation ──────────────────────────────────────────────
    const annotations = message.annotations;
    if (Array.isArray(annotations)) {
      if (normaliseAnnotations(annotations as Array<Record<string, unknown>>)) {
        changed = true;
      }
    }

    // ── Reasoning handling ────────────────────────────────────────────────────
    const reasoning = message.reasoning;
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      if (injectReasoning) {
        // Wrap in <think> tags so extractReasoningMiddleware can extract it
        const existingContent =
          typeof message.content === 'string' ? message.content : '';
        message.content = `<think>${reasoning}</think>${existingContent}`;
      }
      // Always remove the raw reasoning field — either it was moved into content
      // above, or we drop it to prevent it leaking into the response text
      delete message.reasoning;
      changed = true;
    }
  }

  return changed ? JSON.stringify(parsed) : json;
}

/**
 * Transforms a single SSE data chunk:
 * - Normalises nested `url_citation` annotations in `delta.annotations`.
 * - When `injectReasoning` is true, converts `delta.reasoning` into
 *   `delta.content` with `<think>` / `</think>` wrapping (tracked via
 *   `reasoningState`) so `extractReasoningMiddleware` can extract the tokens.
 * - When `injectReasoning` is false, drops `delta.reasoning` entirely so it
 *   never leaks into the streamed content.
 */
function transformStreamingChunk(
  json: string,
  // Per-choice state: true = currently inside a <think> block
  reasoningState: Map<number, boolean>,
  injectReasoning: boolean
): string {
  let parsed: Record<string, unknown>;

  // Attempt to parse the SSE chunk JSON; return it unchanged if malformed
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return json;
  }

  // `choices` holds the incremental deltas for this chunk
  const choices = parsed.choices as Array<Record<string, unknown>> | undefined;

  // Nothing to transform if there are no choices
  if (!Array.isArray(choices)) {
    return json;
  }

  let changed = false;

  for (const choice of choices) {
    // `index` identifies which parallel completion stream this delta belongs to
    const index = typeof choice.index === 'number' ? choice.index : 0;

    // `delta` carries the incremental token(s) for this chunk
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (delta === undefined) continue;

    // ── Annotation normalisation ──────────────────────────────────────────────
    const annotations = delta.annotations;
    if (Array.isArray(annotations)) {
      if (normaliseAnnotations(annotations as Array<Record<string, unknown>>)) {
        changed = true;
      }
    }

    // ── Reasoning handling ────────────────────────────────────────────────────
    const reasoning = delta.reasoning;
    const content = delta.content;

    if (typeof reasoning === 'string' && reasoning.length > 0) {
      if (injectReasoning) {
        // Prepend opening <think> tag only on the very first reasoning token
        const alreadyOpen = reasoningState.get(index) ?? false;
        reasoningState.set(index, true);
        delta.content = (alreadyOpen ? '' : '<think>') + reasoning;
      } else {
        // Drop reasoning — set content to empty string so nothing leaks
        delta.content = typeof content === 'string' ? content : '';
      }
      // Always remove the non-standard reasoning field
      delete delta.reasoning;
      changed = true;
    } else if (
      injectReasoning &&
      typeof content === 'string' &&
      content.length > 0
    ) {
      // First regular content token after reasoning — close the <think> block
      const wasOpen = reasoningState.get(index) ?? false;
      if (wasOpen) {
        reasoningState.set(index, false);
        delta.content = `</think>${content}`;
        changed = true;
      }
    }
  }

  return changed ? JSON.stringify(parsed) : json;
}

// ── Response wrappers ─────────────────────────────────────────────────────────

function transformNonStreamingResponse(
  response: Response,
  injectReasoning: boolean
): Response {
  const originalText = response.text.bind(response);

  return new Proxy(response, {
    get(target, prop) {
      // Intercept `.json()` — transform then re-parse
      if (prop === 'json') {
        return async () => {
          const text = await originalText();
          const transformed = transformNonStreamingJson(text, injectReasoning);
          return JSON.parse(transformed) as unknown;
        };
      }

      // Intercept `.text()` — return the transformed raw text string
      if (prop === 'text') {
        return async () => {
          const text = await originalText();
          return transformNonStreamingJson(text, injectReasoning);
        };
      }

      // Intercept `.body` — pipe through a buffering transform stream
      if (prop === 'body') {
        const body = target.body;
        if (body === null) return null;
        return body.pipeThrough(createNonStreamingTransform(injectReasoning));
      }

      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

function createNonStreamingTransform(
  injectReasoning: boolean
): TransformStream<Uint8Array, Uint8Array> {
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new TransformStream({
    transform(chunk, controller) {
      chunks.push(chunk);
      const text = decoder.decode(chunk, { stream: true });

      // If we spot an SSE `data:` line the body is actually streaming —
      // pass chunks through immediately and stop buffering
      if (text.includes('data: ')) {
        controller.enqueue(chunk);
        chunks.length = 0;
      }
    },
    flush(controller) {
      if (chunks.length === 0) return;
      const fullText = chunks.map(c => decoder.decode(c)).join('');
      const transformed = transformNonStreamingJson(fullText, injectReasoning);
      controller.enqueue(encoder.encode(transformed));
    },
  });
}

function transformStreamingResponse(
  response: Response,
  injectReasoning: boolean
): Response {
  const body = response.body;
  if (body === null) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Per-choice reasoning state: tracks whether a <think> block is currently open
  const reasoningState = new Map<number, boolean>();

  // Incomplete line carried over from the previous chunk
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split('\n');
      // The last element may be an incomplete line — save it for the next chunk
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const jsonStr = line.slice(6);
          const transformed = transformStreamingChunk(
            jsonStr,
            reasoningState,
            injectReasoning
          );
          controller.enqueue(encoder.encode(`data: ${transformed}\n`));
        } else {
          controller.enqueue(encoder.encode(`${line}\n`));
        }
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        if (buffer.startsWith('data: ') && buffer !== 'data: [DONE]') {
          const jsonStr = buffer.slice(6);
          const transformed = transformStreamingChunk(
            jsonStr,
            reasoningState,
            injectReasoning
          );
          controller.enqueue(encoder.encode(`data: ${transformed}\n`));
        } else {
          controller.enqueue(encoder.encode(`${buffer}\n`));
        }
      }
    },
  });

  const newBody = body.pipeThrough(transformStream);

  return new Response(newBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a custom fetch wrapper that:
 * 1. Merges OpenRouter-specific params into the JSON body of POST requests.
 * 2. Normalises nested `url_citation` annotation objects to the flat format
 *    `@ai-sdk/openai` expects, so web-search citations surface as
 *    `{type:"source"}` stream/response parts.
 * 3. When reasoning is active (`extraBody.reasoning` is set), injects
 *    `delta.reasoning` as `<think>…</think>` tags so
 *    `extractReasoningMiddleware({ tagName: 'think' })` can extract them.
 *    When reasoning is off, drops `delta.reasoning` entirely so those tokens
 *    never appear in the response text.
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
    // Only intercept POST requests with a string body; pass everything else through
    if (
      init?.method?.toUpperCase() !== 'POST' ||
      typeof init.body !== 'string'
    ) {
      return baseFetch(input, init);
    }

    let parsed: Record<string, unknown>;

    // If the body is not valid JSON we cannot merge extraBody — forward as-is
    try {
      parsed = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return baseFetch(input, init);
    }

    // Merge OpenRouter-specific fields; extraBody values take precedence
    const merged = { ...parsed, ...extraBody };

    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify(merged),
    });

    // Always apply the transform so delta.reasoning is handled (injected or
    // dropped) — models can emit it even when not explicitly requested
    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('text/event-stream')
      ? transformStreamingResponse(response, injectReasoning)
      : transformNonStreamingResponse(response, injectReasoning);
  };
}
