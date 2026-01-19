import { z } from 'zod';

// Base Utilities
const urlField = z.string().url();
const optionalFilename = z.string().optional();

// Content Schemas

// Text content
const TextContent = z.object({
  type: z.literal('text'),
  text: z.string(),
});

// Reasoning content
const ReasoningContent = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
});

// Image URL content
const ImageUrlContent = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: urlField,
  }),
  filename: optionalFilename,
});

// Document content
const DocumentContent = z.object({
  type: z.literal('document'),
  source: z.object({
    type: z.literal('url'),
    url: urlField,
  }),
  filename: optionalFilename,
});

// Tool call result content
const ResultContent = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown(),
});

// Tool call request content
const ToolCallContent = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  toolInput: z.unknown(),
});

// Source content
const SourceContent = z
  .object({
    type: z.literal('source'),
    sourceType: z.literal('url'),
    id: z.string(),
    url: z.string().url(),
    title: z.string(),
    content: z.string().optional(),
    favicon: z.string().optional(),
  })
  .describe('Source citation block');

export type DocumentContentPayload = z.infer<typeof DocumentContent>;

//  Discriminated Content Union
const ContentItem = z.discriminatedUnion('type', [
  TextContent,
  ReasoningContent,
  ImageUrlContent,
  DocumentContent,
  ResultContent,
  ToolCallContent,
  SourceContent,
]);

// Message Schema
export const MessageSchema = z.object({
  role: z.enum(['system', 'assistant', 'user', 'tool']),
  content: z.union([
    z.string(), // legacy
    z.array(ContentItem), // modern
  ]),
});

export type MessagePayload = z.infer<typeof MessageSchema>;

//  Model Schema
export const ModelSchema = z
  .string()
  .regex(
    /^[^/]+\/[^/]+$/,
    "Model must contain a '/' separating provider and model"
  );

export type ModelPayload = z.infer<typeof ModelSchema>;
