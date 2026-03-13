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
  // Track whether any annotation was modified
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

    // Mark that at least one annotation was changed
    changed = true;
  }

  return changed;
}

// ── JSON transform helpers ────────────────────────────────────────────────────

/**
 * Transforms a non-streaming OpenRouter JSON response body:
 * - Normalises nested `url_citation` annotations so `@ai-sdk/openai` can parse
 *   them into `{type:"source"}` content parts.
 * - Injects `message.reasoning` into `message.content` as `<think>` tags so
 *   that `extractReasoningMiddleware` can later separate the thinking from the
 *   final answer.
 */
function transformNonStreamingJson(json: string): string {
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

  // Track whether anything was modified so we avoid a redundant JSON.stringify
  let changed = false;

  for (const choice of choices) {
    // Each choice contains a `message` object with the model's reply
    const message = choice.message as Record<string, unknown> | undefined;
    if (message === undefined) continue;

    // ── Annotation normalisation ──────────────────────────────────────────────
    const annotations = message.annotations;
    if (Array.isArray(annotations)) {
      // Flatten nested url_citation objects so @ai-sdk/openai can read them
      if (normaliseAnnotations(annotations as Array<Record<string, unknown>>)) {
        changed = true;
      }
    }

    // ── Reasoning injection ───────────────────────────────────────────────────
    const reasoning = message.reasoning;
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      // Preserve any existing text content; default to empty string if absent
      const existingContent =
        typeof message.content === 'string' ? message.content : '';

      // Wrap the reasoning in <think> tags and prepend to the text content
      message.content = `<think>${reasoning}</think>${existingContent}`;

      // Remove the original `reasoning` field to avoid duplication
      delete message.reasoning;
      changed = true;
    }
  }

  // Only re-serialise if the parsed object was actually modified
  return changed ? JSON.stringify(parsed) : json;
}

/**
 * Transforms a single SSE data chunk:
 * - Normalises nested `url_citation` annotations in `delta.annotations`.
 * - Converts `delta.reasoning` into `delta.content` with `<think>` / `</think>`
 *   wrapping (tracked via `reasoningState`) so that `extractReasoningMiddleware`
 *   can extract the reasoning tokens.
 */
function transformStreamingChunk(
  json: string,
  // Per-choice state: true = currently inside a <think> block
  reasoningState: Map<number, boolean>
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

  // Track whether anything was modified to avoid an unnecessary re-serialise
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
      // Flatten nested url_citation objects in-place
      if (normaliseAnnotations(annotations as Array<Record<string, unknown>>)) {
        changed = true;
      }
    }

    // ── Streaming reasoning injection ─────────────────────────────────────────
    const reasoning = delta.reasoning;
    const content = delta.content;

    if (typeof reasoning === 'string' && reasoning.length > 0) {
      // Check whether a <think> tag has already been opened for this choice index
      const alreadyOpen = reasoningState.get(index) ?? false;

      // Mark this choice as being in an active reasoning block
      reasoningState.set(index, true);

      // Prepend the opening <think> tag only on the very first reasoning token
      delta.content = (alreadyOpen ? '' : '<think>') + reasoning;

      // Remove the `reasoning` field so the SDK only sees `content`
      delete delta.reasoning;
      changed = true;
    } else if (typeof content === 'string' && content.length > 0) {
      // We received a regular content token — check if a reasoning block is open
      const wasOpen = reasoningState.get(index) ?? false;
      if (wasOpen) {
        // Close the <think> block before the first regular content token
        reasoningState.set(index, false);
        delta.content = `</think>${content}`;
        changed = true;
      }
    }
  }

  // Only re-serialise if the parsed object was actually modified
  return changed ? JSON.stringify(parsed) : json;
}

// ── Response wrappers ─────────────────────────────────────────────────────────

function transformNonStreamingResponse(response: Response): Response {
  // Bind the original `.text()` method so it can be called inside the Proxy
  const originalText = response.text.bind(response);

  // Wrap the response in a Proxy so we can intercept property accesses
  return new Proxy(response, {
    get(target, prop) {
      // Intercept `.json()` — parse text, transform it, then re-parse as JSON
      if (prop === 'json') {
        return async () => {
          const text = await originalText();
          const transformed = transformNonStreamingJson(text);
          return JSON.parse(transformed) as unknown;
        };
      }

      // Intercept `.text()` — return the transformed raw text string
      if (prop === 'text') {
        return async () => {
          const text = await originalText();
          return transformNonStreamingJson(text);
        };
      }

      // Intercept `.body` — pipe through a transform stream that buffers the
      // entire payload and applies the non-streaming JSON transform on flush
      if (prop === 'body') {
        const body = target.body;
        // Return null unchanged if the response has no body
        if (body === null) return null;
        return body.pipeThrough(createNonStreamingTransform());
      }

      // For all other properties, delegate to the real response object
      const value = Reflect.get(target, prop, target) as unknown;

      // Ensure methods are bound to the original target, not the Proxy
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

function createNonStreamingTransform(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  // Accumulate raw chunks until the full response body has arrived
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new TransformStream({
    transform(chunk, controller) {
      // Buffer every incoming chunk
      chunks.push(chunk);
      const text = decoder.decode(chunk, { stream: true });

      // If we spot an SSE `data:` line the body is actually streaming —
      // pass chunks through immediately and stop buffering
      if (text.includes('data: ')) {
        controller.enqueue(chunk);
        chunks.length = 0; // Clear the buffer since we're in pass-through mode
      }
    },
    flush(controller) {
      // Nothing to do if the buffer is empty (streaming pass-through was used)
      if (chunks.length === 0) return;

      // Decode and join all buffered chunks into a single string
      const fullText = chunks.map(c => decoder.decode(c)).join('');

      // Apply the non-streaming JSON transform (annotations + reasoning)
      const transformed = transformNonStreamingJson(fullText);

      // Re-encode the transformed text and push it downstream
      controller.enqueue(encoder.encode(transformed));
    },
  });
}

function transformStreamingResponse(response: Response): Response {
  const body = response.body;

  // Return the response unchanged if it has no body
  if (body === null) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Per-choice reasoning state: tracks whether a <think> block is currently open
  const reasoningState = new Map<number, boolean>();

  // Incomplete line carried over from the previous chunk
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Append the decoded chunk to the carry-over buffer
      buffer += decoder.decode(chunk, { stream: true });

      // Split on newlines to isolate individual SSE lines
      const lines = buffer.split('\n');

      // The last element may be an incomplete line — save it for the next chunk
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        // Process only `data:` lines that are not the terminal [DONE] sentinel
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          // Strip the `data: ` prefix to get the raw JSON payload
          const jsonStr = line.slice(6);

          // Apply the streaming chunk transform (annotations + reasoning tags)
          const transformed = transformStreamingChunk(jsonStr, reasoningState);

          // Re-emit the transformed line with the `data: ` prefix restored
          controller.enqueue(encoder.encode(`data: ${transformed}\n`));
        } else {
          // Pass through comment lines, empty lines, and [DONE] sentinel as-is
          controller.enqueue(encoder.encode(`${line}\n`));
        }
      }
    },
    flush(controller) {
      // Handle any leftover data in the buffer after the stream ends
      if (buffer.length > 0) {
        if (buffer.startsWith('data: ') && buffer !== 'data: [DONE]') {
          // Transform and emit any final partial `data:` line
          const jsonStr = buffer.slice(6);
          const transformed = transformStreamingChunk(jsonStr, reasoningState);
          controller.enqueue(encoder.encode(`data: ${transformed}\n`));
        } else {
          // Emit non-data lines (e.g. [DONE]) unchanged
          controller.enqueue(encoder.encode(`${buffer}\n`));
        }
      }
    },
  });

  // Pipe the original response body through the SSE transform stream
  const newBody = body.pipeThrough(transformStream);

  // Reconstruct the Response with the transformed body but original metadata
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
 * 3. Injects `reasoning` content as `<think>…</think>` tags when reasoning is
 *    requested. Pair with `extractReasoningMiddleware({ tagName: 'think' })`.
 *
 * The transform is always applied because annotation normalisation is always
 * needed when OpenRouter's web-search plugin is active, and it is a no-op for
 * responses that contain neither annotations nor reasoning.
 */
export function createOpenRouterFetchWrapper(
  extraBody: OpenRouterExtraBody,
  // Default to the global fetch so callers don't need to pass it explicitly
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
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

    // Merge OpenRouter-specific fields (e.g. plugins, provider preferences) into
    // the request body — extraBody values take precedence over the original body
    const merged = { ...parsed, ...extraBody };

    // Fire the actual HTTP request with the enriched body
    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify(merged),
    });

    // Choose the appropriate transform based on whether the response is SSE or plain JSON
    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('text/event-stream')
      ? transformStreamingResponse(response)
      : transformNonStreamingResponse(response);
  };
}
