// completionsSchema.ts
import { z } from "zod";
import { messageSchema } from "./common.validators";

export const completionsSchema = z.object({
  messages: z.array(messageSchema).nonempty("Messages array cannot be empty"),
  model: z
    .string({ required_error: "Model is required" })
    .min(1, "Model cannot be empty"),
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

export type CompletionsPayload = z.infer<typeof completionsSchema>;
