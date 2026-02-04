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
 * AssistantTextPart
 */
export const AssistantTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * AssistantReasoningPart
 */
export const AssistantReasoningPartSchema = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
});

/**
 * AssistantFilePart
 */
export const AssistantFilePartSchema = z.object({
  type: z.literal('file'),
  data: BinaryDataSchema,
  mediaType: z.string(),
  filename: z.string().optional(),
});

/**
 * AssistantToolCallPart
 */
export const AssistantToolCallPartSchema = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.record(z.unknown()),
});

/**
 * Union of all assistant content parts
 */
export const AssistantContentPartSchema = z.union([
  AssistantTextPartSchema,
  AssistantReasoningPartSchema,
  AssistantFilePartSchema,
  AssistantToolCallPartSchema,
]);

/**
 * AssistantMessage
 */
export const AssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.union([z.string(), z.array(AssistantContentPartSchema)]),
});
