import { z } from 'zod';

import { MessageSchema, ModelSchema } from './common.schema';

export const ModelSelectSchema = z.object({
  topkModels: z.number().int().optional(),
  messages: z.array(MessageSchema).nonempty('Messages array cannot be empty'),
  models: z.array(ModelSchema).nonempty('Models array cannot be empty'),
  fallbackModels: z.array(ModelSchema).optional(),
  kwargs: z.record(z.unknown()).optional(),
  search: z.boolean().optional(),
  tools: z.record(z.unknown()).optional(), // Tools parameter for function calling
});

export type ModelSelectPayload = z.infer<typeof ModelSelectSchema>;
