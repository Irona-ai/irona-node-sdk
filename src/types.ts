import { ModelPayload } from "./validators/common.validators";
export type Config = {
  baseUrl?: string;
  apiKey?: string;
  fallback_models?:ModelPayload[]
};
export type ChatModelConfig = {
  apiKey: string;
  modelName: string;
  temperature?: number;
  maxRetries?: number;
  maxTokens?: number;
};
