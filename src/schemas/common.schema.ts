import { z } from "zod";

// Schema for text content
const TextContent = z.object({
  type: z.literal("text"),
  text: z.string(),
});

// Schema for image URL content
const ImageUrlContent = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string().url(),
  }),
});

// Schema for file content (e.g., PDF documents)
const FileContent = z.object({
  type: z.literal("file"),
  data: z.any(), // This will hold the file buffer or base64 data
  mimeType: z.string(), // Ensure correct MIME type
});

// Create a discriminated union based on the 'type' field
const ContentItem = z.discriminatedUnion("type", [
  TextContent,
  ImageUrlContent,
  FileContent,
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
