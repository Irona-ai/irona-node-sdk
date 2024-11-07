// completionsSchema.ts
import { z } from "zod";
import { ModelSelectSchema } from "./modelSelect.validator";

export const CompletionsSchema = ModelSelectSchema.extend({
  temperature: z
    .number()
    .min(0, "Temperature must be at least 0")
    .max(1, "Temperature cannot exceed 1")
    .optional(),
  maxRetries: z
    .number()
    .int("Max retries must be an integer")
    .positive("Max retries must be a positive integer")
    .optional(),
  maxTokens: z
    .number()
    .int("Max tokens must be an integer")
    .positive("Max tokens must be a positive integer")
    .optional(),
  stream: z.boolean().optional(),
});

export type CompletionsPayload = z.infer<typeof CompletionsSchema>;
