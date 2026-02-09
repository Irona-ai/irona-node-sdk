import { ModelPayload } from "./schemas/common.schema";

export type GatewayConfig = {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  providerName?: string;
  includeProviderInModelName?: boolean;
};

export type Config = {
  baseUrl?: string;
  apiKey?: string;
  fallback_models?: ModelPayload[];
  gateway?: GatewayConfig;
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
