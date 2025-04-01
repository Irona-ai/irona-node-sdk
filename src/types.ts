import { ModelPayload } from "./validators/common.validators";
export type Config = {
  baseUrl?: string;
  apiKey?: string;
  fallback_models?: ModelPayload[];
};
export type ChatModelConfig = {
  apiKey: string;
  modelName: string;
  temperature?: number;
  maxRetries?: number;
  maxTokens?: number;
};

export type ErrorTrace = {
  provider: string | null;
  model: string | null;
  error: string;
}[];

export interface ErrorResponse {
  error: string;
  error_trace: ErrorTrace;
  recovered?: boolean;
}