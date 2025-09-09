import { z } from "zod";

// Schema for text content
const TextContent = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ReasoningContent = z.object({
  type : z.literal("reasoning"),
  text: z.string(),
})

// Schema for image URL content
const ImageUrlContent = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string().url(),
  }),
  filename: z.string().optional(),
});

// Schema for document content (with URL source)
const DocumentContent = z.object({
  type: z.literal("document"),
  source: z.object({
    type: z.literal("url"),
    url: z.string().url(),
  }),
  filename: z.string().optional(),
});

export type DocumentContentPayload = z.infer<typeof DocumentContent>;

// Create a discriminated union based on the 'type' field
const ContentItem = z.discriminatedUnion("type", [
  TextContent,
  ReasoningContent,
  ImageUrlContent,
  DocumentContent,
]);

// Message schema supporting both array and string formats for `content`
export const MessageSchema = z.object({
  role: z.enum(["system", "assistant", "user"], {
    required_error: "Role is required",
  }),
  content: z.union([
    z.string(), // Legacy support: single string message
    z.array(ContentItem), // Modern format: array of content objects
  ]),
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
