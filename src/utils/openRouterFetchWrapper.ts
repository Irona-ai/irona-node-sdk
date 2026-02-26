import type { OpenRouterExtraBody } from './openRouterMapper';

/**
 * Strips `annotations` from OpenRouter chat completion responses.
 * OpenRouter adds `annotations` (URL citations) when the web search plugin
 * is active, but `@ai-sdk/openai` rejects these as unexpected fields.
 */
function stripAnnotationsFromJson(json: string): string {
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
    // Non-streaming: choice.message.annotations
    const message = choice.message as Record<string, unknown> | undefined;
    if (message !== undefined && 'annotations' in message) {
      delete message.annotations;
      changed = true;
    }
    // Streaming: choice.delta.annotations
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (delta !== undefined && 'annotations' in delta) {
      delete delta.annotations;
      changed = true;
    }
  }

  return changed ? JSON.stringify(parsed) : json;
}

/**
 * Wraps a non-streaming response to strip annotations from the JSON body.
 */
function stripAnnotationsFromResponse(response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    // Streaming — handled by transforming the SSE stream
    return stripAnnotationsFromStream(response);
  }

  // Non-streaming — intercept the body
  const originalText = response.text.bind(response);

  return new Proxy(response, {
    get(target, prop) {
      if (prop === 'json') {
        return async () => {
          const text = await originalText();
          const cleaned = stripAnnotationsFromJson(text);
          return JSON.parse(cleaned) as unknown;
        };
      }
      if (prop === 'text') {
        return async () => {
          const text = await originalText();
          return stripAnnotationsFromJson(text);
        };
      }
      if (prop === 'body') {
        // The AI SDK reads the body ReadableStream directly
        const body = target.body;
        if (body === null) {
          return null;
        }
        return body.pipeThrough(createJsonStripTransform());
      }
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

/**
 * Creates a TransformStream that strips annotations from non-streaming
 * JSON response bodies.
 */
function createJsonStripTransform(): TransformStream<Uint8Array, Uint8Array> {
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new TransformStream({
    transform(chunk, controller) {
      // Buffer all chunks, then process on flush
      chunks.push(chunk);
      // Check if this looks like an SSE stream
      const text = decoder.decode(chunk, { stream: true });
      if (text.includes('data: ')) {
        // This is actually a streaming response — pass through and handle per-line
        // (shouldn't normally reach here due to content-type check above)
        controller.enqueue(chunk);
        chunks.length = 0;
      }
    },
    flush(controller) {
      if (chunks.length === 0) return;
      const fullText = chunks.map(c => decoder.decode(c)).join('');
      const cleaned = stripAnnotationsFromJson(fullText);
      controller.enqueue(encoder.encode(cleaned));
    },
  });
}

/**
 * Wraps a streaming (SSE) response to strip annotations from each chunk.
 */
function stripAnnotationsFromStream(response: Response): Response {
  const body = response.body;
  if (body === null) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      // Keep the last partial line in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const jsonStr = line.slice(6);
          const cleaned = stripAnnotationsFromJson(jsonStr);
          controller.enqueue(encoder.encode(`data: ${cleaned}\n`));
        } else {
          controller.enqueue(encoder.encode(`${line}\n`));
        }
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        if (buffer.startsWith('data: ') && buffer !== 'data: [DONE]') {
          const jsonStr = buffer.slice(6);
          const cleaned = stripAnnotationsFromJson(jsonStr);
          controller.enqueue(encoder.encode(`data: ${cleaned}\n`));
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

/**
 * Creates a custom fetch wrapper that merges OpenRouter-specific params
 * into the JSON body of outgoing POST requests, and strips `annotations`
 * from responses (which @ai-sdk/openai cannot parse).
 *
 * Non-POST requests and requests without a JSON body pass through unchanged.
 */
export function createOpenRouterFetchWrapper(
  extraBody: OpenRouterExtraBody,
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  const hasSearchPlugin = extraBody.plugins?.some(p => p.id === 'web') ?? false;

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

    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify(merged),
    });

    // Strip annotations from responses when web search plugin is active
    if (hasSearchPlugin) {
      return stripAnnotationsFromResponse(response);
    }

    return response;
  };
}
