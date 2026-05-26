import { z } from 'zod';

/**
 * Shared binary / data input type
 */
const BinaryDataSchema = z.union([
  z.string(),
  z.instanceof(Uint8Array),
  z.instanceof(Buffer),
  z.instanceof(ArrayBuffer),
  z.instanceof(URL),
]);

/**
 * TextPart
 */
export const TextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * ImagePart — native (Vercel AI SDK) shape: `{ type: 'image', image: <data> }`.
 * Kept for backward compatibility.
 */
export const ImagePartSchema = z.object({
  type: z.literal('image'),
  image: BinaryDataSchema,
  mediaType: z.string().optional(),
});

/**
 * ImageUrlPart — OpenAI-compatible shape: `{ type: 'image_url', image_url: { url } }`.
 * `url` may be an HTTPS URL or a base64 data URI (`data:image/...;base64,...`).
 */
export const ImageUrlPartSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string(),
    detail: z.string().optional(),
  }),
});

/**
 * FilePart — native (Vercel AI SDK) shape: `{ type: 'file', data, mediaType }`.
 */
export const FilePartSchema = z.object({
  type: z.literal('file'),
  data: BinaryDataSchema,
  mediaType: z.string(),
});

/**
 * DocumentPart — Anthropic-compatible shape:
 *   `{ type: 'document', source: { type: 'url' | 'base64', url? | data?, media_type? } }`.
 * Mapped onto the AI SDK's `file` part with `mediaType` defaulting to
 * `application/pdf`.
 */
export const DocumentPartSchema = z.object({
  type: z.literal('document'),
  source: z.union([
    z.object({
      type: z.literal('url'),
      url: z.string(),
      media_type: z.string().optional(),
    }),
    z.object({
      type: z.literal('base64'),
      data: z.string(),
      media_type: z.string().optional(),
    }),
  ]),
});

export const VideoUrlPartSchema = z.object({
  type: z.literal('video_url'),
  video_url: z.object({
    url: z.string(),
  }),
  filename: z.string().optional(),
});

export const VideoPartSchema = z.object({
  type: z.literal('video'),
  video: z.string(),
});

/**
 * Union of content parts
 */
export const MessagePartSchema = z.union([
  TextPartSchema,
  ImagePartSchema,
  ImageUrlPartSchema,
  FilePartSchema,
  DocumentPartSchema,
  VideoUrlPartSchema,
  VideoPartSchema,
]);

/**
 * UserMessage
 */
export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(MessagePartSchema)]),
});
