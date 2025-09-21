"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageGenerationFieldsSchema = exports.ModelSchema = exports.MessageSchema = void 0;
const zod_1 = require("zod");
// Schema for text content
const TextContent = zod_1.z.object({
    type: zod_1.z.literal("text"),
    text: zod_1.z.string(),
});
// Schema for image URL content
const ImageUrlContent = zod_1.z.object({
    type: zod_1.z.literal("image_url"),
    image_url: zod_1.z.object({
        url: zod_1.z.string().url(),
    }),
    filename: zod_1.z.string().optional(),
});
// Schema for document content (with URL source)
const DocumentContent = zod_1.z.object({
    type: zod_1.z.literal("document"),
    source: zod_1.z.object({
        type: zod_1.z.literal("url"),
        url: zod_1.z.string().url(),
    }),
    filename: zod_1.z.string().optional(),
});
// Create a discriminated union based on the 'type' field
const ContentItem = zod_1.z.discriminatedUnion("type", [
    TextContent,
    ImageUrlContent,
    DocumentContent,
]);
// Message schema supporting both array and string formats for `content`
exports.MessageSchema = zod_1.z.object({
    role: zod_1.z.enum(["system", "assistant", "user"], {
        required_error: "Role is required",
    }),
    content: zod_1.z.union([
        zod_1.z.string(), // Legacy support: single string message
        zod_1.z.array(ContentItem), // Modern format: array of content objects
    ]),
});
// Define modelSchema to validate format like "openai/gpt-4-1106-preview"
exports.ModelSchema = zod_1.z
    .string({ required_error: "Model is required" })
    .regex(/^[^/]+\/[^/]+$/, "Model must contain a '/' separating provider and model");
// Image generation specific fields
exports.ImageGenerationFieldsSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1, "Prompt is required"),
});
