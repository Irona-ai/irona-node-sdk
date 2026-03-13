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
    const nested = ann.url_citation as Record<string, unknown> | undefined;
    if (nested === undefined) continue;
    if (typeof nested.url === 'string') ann.url = nested.url;
    if (typeof nested.title === 'string') ann.title = nested.title;
    if (typeof nested.start_index === 'number')
      ann.start_index = nested.start_index;
    if (typeof nested.end_index === 'number') ann.end_index = nested.end_index;
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
 * - Injects `message.reasoning` into `message.content` as `<think>` tags so
 *   that `extractReasoningMiddleware` can later separate the thinking from the
 *   final answer.
 */
function transformNonStreamingJson(json: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return json;
  }

  const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(choices)) {
    return json;
  }

  let changed = false;
  for (const choice of choices) {
    const message = choice.message as Record<string, unknown> | undefined;
    if (message === undefined) continue;

    // Normalise annotations
    const annotations = message.annotations;
    if (Array.isArray(annotations)) {
      if (normaliseAnnotations(annotations as Array<Record<string, unknown>>)) {
        changed = true;
      }
    }

    // Inject reasoning as <think> tags
    const reasoning = message.reasoning;
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      const existingContent =
        typeof message.content === 'string' ? message.content : '';
      message.content = `<think>${reasoning}</think>${existingContent}`;
      delete message.reasoning;
      changed = true;
    }
  }

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
  reasoningState: Map<number, boolean>
): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return json;
  }

  const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(choices)) {
    return json;
  }

  let changed = false;
  for (const choice of choices) {
    const index = typeof choice.index === 'number' ? choice.index : 0;
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (delta === undefined) continue;

    // Normalise annotations
    const annotations = delta.annotations;
    if (Array.isArray(annotations)) {
      if (normaliseAnnotations(annotations as Array<Record<string, unknown>>)) {
        changed = true;
      }
    }

    // Inject reasoning as <think> tags
    const reasoning = delta.reasoning;
    const content = delta.content;

    if (typeof reasoning === 'string' && reasoning.length > 0) {
      const alreadyOpen = reasoningState.get(index) ?? false;
      reasoningState.set(index, true);
      delta.content = (alreadyOpen ? '' : '<think>') + reasoning;
      delete delta.reasoning;
      changed = true;
    } else if (typeof content === 'string' && content.length > 0) {
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

function transformNonStreamingResponse(response: Response): Response {
  const originalText = response.text.bind(response);

  return new Proxy(response, {
    get(target, prop) {
      if (prop === 'json') {
        return async () => {
          const text = await originalText();
          const transformed = transformNonStreamingJson(text);
          return JSON.parse(transformed) as unknown;
        };
      }
      if (prop === 'text') {
        return async () => {
          const text = await originalText();
          return transformNonStreamingJson(text);
        };
      }
      if (prop === 'body') {
        const body = target.body;
        if (body === null) return null;
        return body.pipeThrough(createNonStreamingTransform());
      }
      const value = Reflect.get(target, prop, target) as unknown;
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
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new TransformStream({
    transform(chunk, controller) {
      chunks.push(chunk);
      const text = decoder.decode(chunk, { stream: true });
      if (text.includes('data: ')) {
        controller.enqueue(chunk);
        chunks.length = 0;
      }
    },
    flush(controller) {
      if (chunks.length === 0) return;
      const fullText = chunks.map(c => decoder.decode(c)).join('');
      const transformed = transformNonStreamingJson(fullText);
      controller.enqueue(encoder.encode(transformed));
    },
  });
}

function transformStreamingResponse(response: Response): Response {
  const body = response.body;
  if (body === null) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reasoningState = new Map<number, boolean>();
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const jsonStr = line.slice(6);
          const transformed = transformStreamingChunk(jsonStr, reasoningState);
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
          const transformed = transformStreamingChunk(jsonStr, reasoningState);
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
 * 3. Injects `reasoning` content as `<think>…</think>` tags when reasoning is
 *    requested. Pair with `extractReasoningMiddleware({ tagName: 'think' })`.
 *
 * The transform is always applied because annotation normalisation is always
 * needed when OpenRouter's web-search plugin is active, and it is a no-op for
 * responses that contain neither annotations nor reasoning.
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
      return baseFetch(input, init);
    }

    const merged = { ...parsed, ...extraBody };

    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify(merged),
    });

    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('text/event-stream')
      ? transformStreamingResponse(response)
      : transformNonStreamingResponse(response);
  };
}
