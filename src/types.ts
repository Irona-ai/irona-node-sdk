import type { RouterConfig } from './router/types';
import type { ModelPayload } from './schemas/common.schema';

export type GatewayConfig = {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  providerName?: string;
  includeProviderInModelName?: boolean;
};

export type ProviderConfig = {
  apiKey: string;
  baseUrl?: string;
};

export type Config = {
  baseUrl?: string;
  apiKey?: string;
  fallbackModels?: ModelPayload[];
  gateway?: GatewayConfig;
  router?: RouterConfig;
  providers?: Partial<Record<string, ProviderConfig>>;
  openRouterFallbackKey?: string;
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
  errorTrace: ErrorTrace;
  recovered?: boolean;
}
