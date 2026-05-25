// Shared response-transform helpers for OpenAI-compatible gateways
// (OpenRouter, LLM Gateway). Both wrap the upstream response so that:
//   - `delta.reasoning` SSE tokens are converted to `<think>…</think>` content
//     (when reasoning is active) — this lets `extractReasoningMiddleware` tag
//     them as reasoning parts in the AI SDK stream
//   - `delta.reasoning` is dropped (when reasoning is off) so emitted thinking
//     tokens never leak into final text
//   - `url_citation` annotations are normalised from the nested
//     `{type, url_citation: {url, title, …}}` shape (Google-style — emitted by
//     both gateways for Gemini search responses) to the flat shape the AI SDK's
//     Zod schema requires (`{type, url, title, start_index, end_index}`).
//   - top-level `metadata` (LLM Gateway routing info) is logged when present,
//     since the Vercel AI SDK does not forward non-OpenAI-spec fields.
//
// Behaviour is identical between the two gateways because they both expose an
// OpenAI-compatible chat-completions surface and both emit `delta.reasoning`
// (sometimes unconditionally, e.g. gpt-5-nano).
import type { LLMGatewayCostData } from '../responseTypes';

interface NormalisedUrlCitation {
  type: 'url_citation';
  url: string;
  title: string;
  start_index: number;
  end_index: number;
}

/**
 * Flattens `url_citation` annotations to the AI SDK's expected schema.
 * Accepts both the OpenAI-style flat form and the Gemini-style nested form
 * (`{type:'url_citation', url_citation:{url,title,…}}`). Drops malformed
 * entries and the upstream `content` blob (which the AI SDK rejects).
 */
function normalizeAnnotations(
  raw: unknown
): NormalisedUrlCitation[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const out: NormalisedUrlCitation[] = [];
  for (const a of raw) {
    if (typeof a !== 'object' || a === null) continue;
    const entry = a as Record<string, unknown>;
    if (entry['type'] !== 'url_citation') continue;

    let url: string | undefined;
    let title = '';
    let startIndex = 0;
    let endIndex = 0;

    if (typeof entry['url'] === 'string') {
      // Flat (OpenAI-style)
      url = entry['url'];
      title = typeof entry['title'] === 'string' ? entry['title'] : '';
      if (typeof entry['start_index'] === 'number') {
        startIndex = entry['start_index'];
      }
      if (typeof entry['end_index'] === 'number') {
        endIndex = entry['end_index'];
      }
    } else if (
      typeof entry['url_citation'] === 'object' &&
      entry['url_citation'] !== null
    ) {
      // Nested (Gemini-style)
      const nested = entry['url_citation'] as Record<string, unknown>;
      url = typeof nested['url'] === 'string' ? nested['url'] : undefined;
      title = typeof nested['title'] === 'string' ? nested['title'] : '';
      if (typeof nested['start_index'] === 'number') {
        startIndex = nested['start_index'];
      }
      if (typeof nested['end_index'] === 'number') {
        endIndex = nested['end_index'];
      }
    }

    if (url === undefined) continue;
    out.push({
      type: 'url_citation',
      url,
      title,
      start_index: startIndex,
      end_index: endIndex,
    });
  }

  return out.length > 0 ? out : undefined;
}

/**
 * Transforms a non-streaming JSON response body's `message.reasoning`.
 * - `injectReasoning=true`: prepend `<think>reasoning</think>` to content.
 * - `injectReasoning=false`: drop reasoning entirely.
 */
export function transformNonStreamingJson(
  json: string,
  injectReasoning: boolean
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
    const message = choice.message as Record<string, unknown> | undefined;
    if (message === undefined) continue;

    // Normalise url_citation annotations so the AI SDK's Zod schema accepts
    // them regardless of which underlying provider the gateway used.
    const rawAnnotations = message['annotations'];
    if (rawAnnotations !== undefined) {
      const normalised = normalizeAnnotations(rawAnnotations);
      if (normalised !== undefined) {
        message['annotations'] = normalised;
      } else {
        delete message['annotations'];
      }
      changed = true;
    }

    const reasoning = message.reasoning;
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      if (injectReasoning) {
        const existingContent =
          typeof message.content === 'string' ? message.content : '';
        message.content = `<think>${reasoning}</think>${existingContent}`;
      }
      delete message.reasoning;
      changed = true;
    }
  }

  return changed ? JSON.stringify(parsed) : json;
}

/**
 * Transforms a single SSE `data: {…}` chunk's `delta.reasoning`.
 * Tracks open `<think>` blocks per `choice.index` via `reasoningState`.
 */
export function transformStreamingChunk(
  json: string,
  reasoningState: Map<number, boolean>,
  injectReasoning: boolean,
  onCost?: (data: LLMGatewayCostData) => void
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

  const streamUsage = parsed.usage as Record<string, unknown> | undefined;
  if (streamUsage?.cost !== undefined && onCost !== undefined) {
    onCost({
      cost: streamUsage.cost as number,
      cost_details: (streamUsage.cost_details ?? {}) as Record<
        string,
        number | null
      >,
    });
  }

  let changed = false;

  for (const choice of choices) {
    const index = typeof choice.index === 'number' ? choice.index : 0;
    const delta = choice.delta as Record<string, unknown> | undefined;
    const message = choice.message as Record<string, unknown> | undefined;

    // Annotations may be on `delta.annotations` mid-stream or on
    // `message.annotations` of the final chunk. Normalise either location into
    // `delta.annotations` so the AI SDK streaming parser surfaces source parts.
    const rawAnnotations = delta?.['annotations'] ?? message?.['annotations'];
    if (rawAnnotations !== undefined) {
      const normalised = normalizeAnnotations(rawAnnotations);
      if (normalised !== undefined) {
        if (delta !== undefined) {
          delta['annotations'] = normalised;
        } else {
          choice['delta'] = { annotations: normalised };
        }
        if (message !== undefined) {
          delete message['annotations'];
          if (Object.keys(message).length === 0) delete choice['message'];
        }
        changed = true;
      } else if (delta !== undefined) {
        delete delta['annotations'];
        changed = true;
      }
    }

    if (delta === undefined) continue;

    const reasoning = delta.reasoning;
    const content = delta.content;

    if (typeof reasoning === 'string' && reasoning.length > 0) {
      if (injectReasoning) {
        const alreadyOpen = reasoningState.get(index) ?? false;
        reasoningState.set(index, true);
        const existingContent = typeof content === 'string' ? content : '';
        delta.content =
          (alreadyOpen ? '' : '<think>') + reasoning + existingContent;
      } else {
        delta.content = typeof content === 'string' ? content : '';
      }
      delete delta.reasoning;
      changed = true;
    } else if (
      injectReasoning &&
      typeof content === 'string' &&
      content.length > 0
    ) {
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

/**
 * Wraps a non-streaming Response so that `.json()` / `.text()` / `.body`
 * all emit a transformed body (reasoning injected or dropped).
 */
export function transformNonStreamingResponse(
  response: Response,
  injectReasoning: boolean
): Response {
  const originalText = response.text.bind(response);

  return new Proxy(response, {
    get(target, prop) {
      if (prop === 'json') {
        return async () => {
          const text = await originalText();
          const transformed = transformNonStreamingJson(text, injectReasoning);
          return JSON.parse(transformed) as unknown;
        };
      }

      if (prop === 'text') {
        return async () => {
          const text = await originalText();
          return transformNonStreamingJson(text, injectReasoning);
        };
      }

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

/**
 * Wraps a streaming SSE Response so each `data: {…}` line is transformed.
 */
export function transformStreamingResponse(
  response: Response,
  injectReasoning: boolean,
  onCost?: (data: LLMGatewayCostData) => void
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
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const jsonStr = line.slice(6);
          const transformed = transformStreamingChunk(
            jsonStr,
            reasoningState,
            injectReasoning,
            onCost
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
            injectReasoning,
            onCost
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

/**
 * Picks the streaming or non-streaming wrapper based on the response
 * content-type — both emit a transformed body.
 */
export function applyResponseReasoningTransform(
  response: Response,
  injectReasoning: boolean,
  onCost?: (data: LLMGatewayCostData) => void
): Response {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('text/event-stream')
    ? transformStreamingResponse(response, injectReasoning, onCost)
    : transformNonStreamingResponse(response, injectReasoning);
}
