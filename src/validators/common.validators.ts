import { z } from "zod";

export const MessageSchema = z.object({
  role: z.enum(["system", "assistant", "user"], {
    required_error: "Role is required",
  }),
  content: z
    .string({ required_error: "Content is required" })
    .min(1, "Content cannot be empty"), // Non-empty string
});

// Define modelSchema to validate format like "openai/gpt-4-1106-preview"
export const ModelSchema = z
  .string({ required_error: "Model is required" })
  .regex(
    /^[^/]+\/[^/]+$/,
    "Model must contain a '/' separating provider and model"
  );
export type ModelPayload = z.infer<typeof ModelSchema>;