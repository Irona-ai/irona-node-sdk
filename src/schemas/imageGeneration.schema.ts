import { z } from "zod";
import { ModelSchema } from "./common.schema";

export const ImageGenerationSchema = z.object({
  prompt: z.string().min(1, "Prompt is required for image generation"),
  models: z.array(ModelSchema).nonempty("Models array cannot be empty"),
  fallback_models: z.array(ModelSchema).optional(),
  
  // Advanced parameters (relevant for image generation)
  temperature: z.number().min(0).max(1).optional(), // Controls creativity/randomness
  maxRetries: z.number().int().positive().optional(), // Retry attempts on failure
  
  // Router parameters
  topk_models: z.number().int().optional(), // Router model selection
  kwargs: z.record(z.any()).optional(), // Additional parameters
});

export type ImageGenerationPayload = z.infer<typeof ImageGenerationSchema>; 