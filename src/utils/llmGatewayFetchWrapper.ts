import type { LLMGatewayExtraBody } from './llmGatewayMapper';
import { logger } from './logger';

// ── Annotation helpers ────────────────────────────────────────────────────────

// LLM Gateway omits start_index/end_index from url_citation annotations and may
// deliver them in choices[*].message.annotations on the final streaming chunk
// instead of choices[*].delta.annotations. Normalise to the exact shape the
// AI SDK's Zod schema requires so source parts reach the caller.
function normalizeAnnotations(raw: unknown):
  | Array<{
      type: 'url_citation';
      url: string;
      title: string;
      start_index: number;
      end_index: number;
    }>
  | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: Array<{
    type: 'url_citation';
    url: string;
    title: string;
    start_index: number;
    end_index: number;
  }> = [];
  for (const a of raw) {
    if (typeof a !== 'object' || a === null) continue;
    const entry = a as Record<string, unknown>;
    if (entry['type'] !== 'url_citation') continue;

    // LLM Gateway uses two formats depending on the underlying provider:
    //   Flat   (OpenAI-style): { type, url, title, start_index?, end_index? }
    //   Nested (Google-style): { type, url_citation: { url, title } }
    let url: string | undefined;
    let title = '';
    if (typeof entry['url'] === 'string') {
      url = entry['url'];
      title = typeof entry['title'] === 'string' ? entry['title'] : '';
    } else if (
      typeof entry['url_citation'] === 'object' &&
      entry['url_citation'] !== null
    ) {
      const nested = entry['url_citation'] as Record<string, unknown>;
      url = typeof nested['url'] === 'string' ? nested['url'] : undefined;
      title = typeof nested['title'] === 'string' ? nested['title'] : '';
    }

    if (url === undefined) continue;

    out.push({
      type: 'url_citation',
      url,
      title,
      start_index:
        typeof entry['start_index'] === 'number' ? entry['start_index'] : 0,
      end_index:
        typeof entry['end_index'] === 'number' ? entry['end_index'] : 0,
    });
  }
  return out.length > 0 ? out : undefined;
}

// ── JSON transform helpers ────────────────────────────────────────────────────

/**
 * Transforms a non-streaming LLMGateway JSON response body:
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

    // Normalize url_citation annotations so the AI SDK can surface them as
    // source parts regardless of which underlying provider LLM Gateway used.
    const rawAnnotations = message['annotations'];
    if (rawAnnotations !== undefined) {
      const normalized = normalizeAnnotations(rawAnnotations);
      if (normalized !== undefined) {
        message['annotations'] = normalized;
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
 * Transforms a single SSE data chunk:
 * - When `injectReasoning` is true, converts `delta.reasoning` into
 *   `delta.content` with `<think>` / `</think>` wrapping (tracked via
 *   `reasoningState`) so `extractReasoningMiddleware` can extract the tokens.
 * - When `injectReasoning` is false, drops `delta.reasoning` entirely so it
 *   never leaks into the streamed content.
 */
function transformStreamingChunk(
  json: string,
  reasoningState: Map<number, boolean>,
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
    const index = typeof choice.index === 'number' ? choice.index : 0;

    const delta = choice.delta as Record<string, unknown> | undefined;
    const message = choice.message as Record<string, unknown> | undefined;

    // LLM Gateway may put url_citation annotations in delta.annotations or
    // message.annotations on the final chunk. Normalise them into delta so the
    // AI SDK streaming parser emits source parts.
    const rawAnnotations = delta?.['annotations'] ?? message?.['annotations'];
    if (rawAnnotations !== undefined) {
      const normalized = normalizeAnnotations(rawAnnotations);
      if (normalized !== undefined) {
        if (delta !== undefined) {
          delta['annotations'] = normalized;
        } else {
          choice['delta'] = { annotations: normalized };
        }
        if (message !== undefined) {
          delete message['annotations'];
          if (Object.keys(message).length === 0) delete choice['message'];
        }
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
        delta.content = (alreadyOpen ? '' : '<think>') + reasoning;
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

// ── Response wrappers ─────────────────────────────────────────────────────────

function transformNonStreamingResponse(
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

// ── Image URL resolution ──────────────────────────────────────────────────────

// Gemini's native API only accepts Google Cloud Storage URIs or base64 inline
// data — not arbitrary HTTPS image URLs. When LLM Gateway tries to translate
// an OpenAI-format image URL to Gemini's format, it returns a 500 error.
// Resolve any HTTP(S) image URLs to base64 data URIs before forwarding so that
// all vision-capable providers work reliably through LLM Gateway.
async function resolveImageUrlsToBase64(
  messages: unknown[],
  fetchFn: typeof globalThis.fetch
): Promise<void> {
  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null) continue;
    const content = (msg as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== 'object' || part === null) continue;
      const p = part as Record<string, unknown>;
      if (p.type !== 'image_url') continue;
      const imageUrlObj = p.image_url as Record<string, unknown> | undefined;
      if (typeof imageUrlObj?.url !== 'string') continue;
      const url = imageUrlObj.url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

      try {
        const imgRes = await fetchFn(url);
        const contentType = imgRes.headers.get('content-type') ?? '';
        const mimeType = contentType.split(';')[0].trim();
        if (!mimeType.startsWith('image/')) {
          continue;
        }
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        imageUrlObj.url = `data:${mimeType};base64,${base64}`;
      } catch (err) {
        logger.warn(
          `[LLMGatewayFetchWrapper] Failed to resolve image URL to base64, sending URL as-is: ${url} — ${err}`
        );
      }
    }
  }
}

// ── File-part normalisation ───────────────────────────────────────────────────

// The @ai-sdk/openai Chat Completions provider encodes PDF/file content as:
//   { type: "file", file: { filename: "...", file_data: "data:application/pdf;base64,..." } }
// LLM Gateway's Zod schema only accepts "text" and "image_url" content types,
// so it rejects this with a 400. Convert all file parts to image_url so the
// request passes LLM Gateway's validation layer.
function transformFilePartsForGateway(messages: unknown[]): void {
  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null) continue;
    const msgObj = msg as Record<string, unknown>;
    const content = msgObj.content;
    if (!Array.isArray(content)) continue;

    let changed = false;
    const newContent: Array<Record<string, unknown>> = content.map(part => {
      if (typeof part !== 'object' || part === null)
        return part as Record<string, unknown>;
      const p = part as Record<string, unknown>;
      if (p.type !== 'file') return p;

      const fileObj = p.file as Record<string, unknown> | undefined;
      const fileData =
        typeof fileObj?.file_data === 'string' ? fileObj.file_data : undefined;
      if (fileData === undefined) return p;

      changed = true;
      return { type: 'image_url', image_url: { url: fileData } };
    });

    if (changed) {
      msgObj.content = newContent;
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a custom fetch wrapper that:
 * 1. Merges LLMGateway-specific params into the JSON body of POST requests.
 * 2. When reasoning is active (`extraBody.reasoning` is set), injects
 *    `delta.reasoning` as `<think>…</think>` tags so
 *    `extractReasoningMiddleware({ tagName: 'think' })` can extract them.
 *    When reasoning is off, drops `delta.reasoning` entirely so those tokens
 *    never appear in the response text.
 *
 * The transform is always applied so that `delta.reasoning` is always cleaned
 * up — models can emit it unconditionally even without a reasoning request,
 * which would otherwise cause tokens to leak into text-delta parts.
 */
export function createLLMGatewayFetchWrapper(
  extraBody: LLMGatewayExtraBody,
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
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

    const { tools: extraTools, ...restExtraBody } = extraBody;
    const merged: Record<string, unknown> = { ...parsed, ...restExtraBody };

    if (extraTools !== undefined && extraTools.length > 0) {
      const existingTools = Array.isArray(parsed.tools)
        ? (parsed.tools as Array<Record<string, unknown>>)
        : [];
      merged.tools = [...existingTools, ...extraTools];
    }

    if (Array.isArray(merged.messages)) {
      await resolveImageUrlsToBase64(merged.messages as unknown[], baseFetch);
      transformFilePartsForGateway(merged.messages as unknown[]);
    }

    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify(merged),
    });

    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('text/event-stream')
      ? transformStreamingResponse(response, injectReasoning)
      : transformNonStreamingResponse(response, injectReasoning);
  };
}
