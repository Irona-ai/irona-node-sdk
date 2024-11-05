import { z } from "zod";

export const messageSchema = z.object({
  role: z.enum(["system", "assistant", "user"], {
    required_error: "Role is required",
  }),
  content: z
    .string({ required_error: "Content is required" })
    .min(1, "Content cannot be empty"), // Non-empty string
});

export const llmProviderSchema = z.object({
  provider: z
    .string({ required_error: "Provider is required" })
    .min(1, "Provider cannot be empty"),
  model: z
    .string({ required_error: "Model is required" })
    .min(1, "Model cannot be empty"),
});
