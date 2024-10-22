import { z } from 'zod';

export const selectModelSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['system', 'assistant', 'user']),
      content: z.string().min(1, "Content cannot be empty"),  // Non-empty string
    })
  ).nonempty("Messages array cannot be empty"),  // Ensure array is not empty
  llm_providers: z.array(
    z.object({
      provider: z.string().min(1, "Provider cannot be empty"),  // Non-empty string
      model: z.string().min(1, "Model cannot be empty"),  // Non-empty string
    })
  ).nonempty("LLM Providers array cannot be empty")  // Ensure array is not empty
});

export type selectModelPayload = z.infer<typeof selectModelSchema>;
