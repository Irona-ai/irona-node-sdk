import { z } from "zod";
import { ModelSchema } from "./common.schema";

export const ImageGenerationSchema = z.object({
  prompt: z.string().min(1, "Prompt is required for image generation"),
  models: z.array(ModelSchema).nonempty("Models array cannot be empty"),
  fallback_models: z.array(ModelSchema).optional(),
  temperature: z.number().min(0).max(1).optional(), 
  maxRetries: z.number().int().positive().optional(), 
  topk_models: z.number().int().optional(), 
  kwargs: z.record(z.any()).optional(), 
});

export type ImageGenerationPayload = z.infer<typeof ImageGenerationSchema>; 