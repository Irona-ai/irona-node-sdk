export type ProviderName =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'togetherai'
  | 'mistral'
  | 'perplexity'
  | 'xai';

export interface CostBreakdown {
  hasDiscount: boolean;
  totalCost: number;
}

export interface CompletionsResponse {
  response: {
    content?: string;
    reasoningContent?: unknown;
    role?: string;
    fullStream?: AsyncIterable<unknown>;
  };
  provider: string;
  model: string;
  cost?: Promise<CostBreakdown | null>;
}

export interface ModelInfo {
  provider: string;
  model: string;
}

export interface ModelSelectResponse {
  providers: ModelInfo[];
  fallbackProviders: ModelInfo[];
  error: unknown;
  success: boolean;
  message: string;
  statusCode: number;
}

export type TextPart = {
  type: 'text';
  text: string;
};

export type ReasoningPart = {
  type: 'reasoning';
  text: string;
};

export type ImagePart = {
  type: 'image';
  image: string;
};

export type FilePart = {
  type: 'file';
  data: string;
  mediaType: string;
};

export type ToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: unknown;
  isError?: string;
};

export type ToolCallPart = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ContentPart =
  | TextPart
  | ReasoningPart
  | ImagePart
  | FilePart
  | ToolResultPart
  | ToolCallPart;
