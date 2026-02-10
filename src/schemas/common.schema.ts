import { z } from 'zod';

import { AssistantMessageSchema } from './assistanceMessage.schema';
import { ToolMessageSchema } from './toolMessage.schema';
import { UserMessageSchema } from './userMessage.schema';

export const SystemMessageSchema = z.object({
  role: z.literal('system'),
  content: z.string(),
});

export const MessageSchema = z.union([
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
]);

export type MessagePayload = z.infer<typeof MessageSchema>;

//  Model Schema
export const ModelSchema = z
  .string()
  .regex(
    /^[^/]+\/[^/]+$/,
    "Model must contain a '/' separating provider and model"
  );

export type ModelPayload = z.infer<typeof ModelSchema>;
