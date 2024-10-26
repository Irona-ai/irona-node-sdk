export type Config = {
  apiKey: string;
  baseUrl?: string;
};
export type ChatModelConfig = {
  apiKey: string;
  modelName: string;
  temperature?: number;
  maxRetries?: number,
  maxTokens?: number,
};
