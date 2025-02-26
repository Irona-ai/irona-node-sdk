import { z } from "zod";

const TextContent = z.object({
  type: z.literal("text"),
  text: z.string(),
});

// Define the schema for an image_url content item
const ImageUrlContent = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string().url(),
  }),
});

// Create a discriminated union based on the 'type' field
const ContentItem = z.discriminatedUnion("type", [
  TextContent,
  ImageUrlContent,
]);

export const MessageSchema = z.object({
  role: z.enum(["system", "assistant", "user"], {
    required_error: "Role is required",
  }),
  content: z.array(ContentItem),
});

export type MessagePayload = z.infer<typeof MessageSchema>;
// Define modelSchema to validate format like "openai/gpt-4-1106-preview"
export const ModelSchema = z
  .string({ required_error: "Model is required" })
  .regex(
    /^[^/]+\/[^/]+$/,
    "Model must contain a '/' separating provider and model"
  );
export type ModelPayload = z.infer<typeof ModelSchema>;
