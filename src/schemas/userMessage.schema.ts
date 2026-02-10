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
 * ImagePart
 */
export const ImagePartSchema = z.object({
  type: z.literal('image'),
  image: BinaryDataSchema,
  mediaType: z.string().optional(),
});

/**
 * FilePart
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
  ImagePartSchema,
  FilePartSchema,
]);

/**
 * UserMessage
 */
export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(MessagePartSchema)]),
});
