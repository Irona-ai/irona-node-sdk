import { z } from "zod";
import { MessageSchema, ModelSchema } from "./common.schema";

export const ModelSelectSchema = z.object({
  topk_models: z.number().int().optional(),
  messages: z.array(MessageSchema).nonempty("Messages array cannot be empty"),
  models: z.array(ModelSchema).nonempty("Models array cannot be empty"),
  fallback_models: z.array(ModelSchema).optional(),
  kwargs: z.record(z.any()).optional(),
  search: z.boolean().optional(),
  // Image generation specific fields
  request_type: z.enum(["chat", "image_generation"]).optional().default("chat"),
  prompt: z.string().optional(), // For image generation
});

export type ModelSelectPayload = z.infer<typeof ModelSelectSchema>;
