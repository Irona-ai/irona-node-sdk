export type Config = {
  baseUrl?: string;
  apiKey?: string;
};
export type ChatModelConfig = {
  apiKey: string;
  modelName: string;
  temperature?: number;
  maxRetries?: number;
  maxTokens?: number;
};
