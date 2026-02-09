import { z } from 'zod';

/**
 * ToolResultPart
 */
export const ToolResultPartSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  output: z.unknown(),
  isError: z.boolean().optional(),
});

/**
 * ToolMessage
 */
export const ToolMessageSchema = z.object({
  role: z.literal('tool'),
  content: z.array(ToolResultPartSchema),
});
