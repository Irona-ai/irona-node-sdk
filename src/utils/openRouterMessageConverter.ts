import type { MessagePayload } from '../schemas/common.schema';

import type { OpenRouterUserMessage } from './openRouterFetchWrapper';

/**
 * Converts a BinaryData value (string | Buffer | Uint8Array | ArrayBuffer | URL)
 * to a plain string. Buffers and typed arrays are base64-encoded; URL objects
 * are unwrapped to their href.
 */
function binaryToString(
  data: string | Uint8Array | Buffer | ArrayBuffer | URL
): string {
  if (typeof data === 'string') return data;
  if (data instanceof URL) return data.href;
  return Buffer.from(
    data instanceof ArrayBuffer ? new Uint8Array(data) : data
  ).toString('base64');
}

/**
 * Converts user messages from the SDK's internal MessagePayload format to
 * OpenRouter's native OpenAI-compatible content-part format.
 *
 * Only user messages are returned — system, assistant, and tool messages are
 * serialised correctly by the Vercel AI SDK's OpenAI adapter and are left as-is
 * in the outgoing request body by the fetch wrapper.
 *
 * The key transformation is `video_url` parts:
 *   `{ type:'video_url', video_url:{url}, filename? }`
 * which the Vercel AI SDK does not understand but OpenRouter requires.
 */
export function buildOpenRouterUserMessages(
  messages: MessagePayload[]
): OpenRouterUserMessage[] {
  const result: OpenRouterUserMessage[] = [];

  for (const msg of messages) {
    if (msg.role !== 'user') continue;

    if (typeof msg.content === 'string') {
      result.push({ role: 'user', content: msg.content });
      continue;
    }

    const content = msg.content.map(part => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text };
      }

      if (part.type === 'image_url') {
        return {
          type: 'image_url' as const,
          image_url: {
            url: part.image_url.url,
            ...(part.image_url.detail !== undefined
              ? { detail: part.image_url.detail }
              : {}),
          },
        };
      }

      if (part.type === 'image') {
        const url = binaryToString(part.image);
        return { type: 'image_url' as const, image_url: { url } };
      }

      if (part.type === 'file') {
        const data = binaryToString(part.data);
        // If data is already a URL (https or http) keep it; otherwise treat as base64
        const url =
          data.startsWith('https://') || data.startsWith('http://')
            ? data
            : `data:${part.mediaType};base64,${data}`;
        return { type: 'image_url' as const, image_url: { url } };
      }

      if (part.type === 'document') {
        const source = part.source;
        const url =
          source.type === 'url'
            ? source.url
            : `data:${source.media_type ?? 'application/pdf'};base64,${source.data}`;
        return { type: 'image_url' as const, image_url: { url } };
      }

      if (part.type === 'video_url') {
        return {
          type: 'video_url' as const,
          video_url: { url: part.video_url.url },
          ...(part.filename !== undefined ? { filename: part.filename } : {}),
        };
      }

      if (part.type === 'video') {
        return {
          type: 'video_url' as const,
          video_url: { url: part.video },
        };
      }

      // Unreachable due to exhaustive schema union, but satisfies TypeScript
      return {
        type: 'text' as const,
        text: '',
      };
    });

    result.push({ role: 'user', content });
  }

  return result;
}
