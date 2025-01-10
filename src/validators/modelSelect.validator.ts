import { z } from "zod";
import { MessageSchema, ModelSchema } from "./common.validators";

export const ModelSelectSchema = z.object({
  topk_models: z.number().int().optional(),
  messages: z.array(MessageSchema).nonempty("Messages array cannot be empty"),
  models: z.array(ModelSchema).nonempty("Models array cannot be empty"),
  fallback_models: z.array(ModelSchema).optional(),
  kwargs: z.record(z.any()).optional(),
});

export type ModelSelectPayload = z.infer<typeof ModelSelectSchema>;
