import { z } from 'zod';

/**
 * Shared binary / data input type (used for file/PDF parts)
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
 * ImageUrlPart — OpenAI-compatible image format.
 * `url` may be an HTTPS URL or a base64 data URI (data:image/...;base64,...).
 */
export const ImageUrlPartSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string(),
    detail: z.string().optional(),
  }),
});

/**
 * FilePart (PDF / binary file input — Vercel AI SDK native format)
 */
export const FilePartSchema = z.object({
  type: z.literal('file'),
  data: BinaryDataSchema,
  mediaType: z.string(),
});

/**
 * Union of content parts
 */
export const MessagePartSchema = z.union([
  TextPartSchema,
  ImageUrlPartSchema,
  FilePartSchema,
]);

/**
 * UserMessage
 */
export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(MessagePartSchema)]),
});
