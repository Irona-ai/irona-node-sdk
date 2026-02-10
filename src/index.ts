import { MissingApiKeyError } from './errors';
import { IronaChatClient } from './irona-chat-client/IronaChatClient';
import type { CompletionsResponse } from './irona-chat-client/IronaChatClient';
import { IronaRouterClient } from './irona-router-client/IronaRouterClient';
import type { ModelSelectResponse } from './irona-router-client/IronaRouterClient';
import type { CompletionsPayload } from './schemas/completions.schema';
import type { ModelSelectPayload } from './schemas/modelSelect.schema';
import { updateProvidersFromGist } from './supported_models';
import type { Config, GatewayConfig } from './types';
import {
  IRONAAI_API_KEY_PREFIX,
  DEFAULT_BASE_URL,
  SUPPORTED_MODELS_DEFAULT_URL,
} from './utils/constants';
import { logger } from './utils/logger';
require('dotenv').config();

export class IronaAI {
  private ironaRouter: IronaRouterClient;
  private llmChatService: IronaChatClient;
  private constructor(config: Config = {}) {
    // Check for API key
    const apiKey = config.apiKey ?? process.env.IRONAAI_API_KEY ?? '';
    if (!apiKey) {
      throw new MissingApiKeyError(
        "The API key is missing. Please provide the API key either through the 'IRONAAI_API_KEY' environment variable or the 'config.apiKey' property."
      );
    }
    if (
      typeof apiKey !== 'string' ||
      !apiKey.startsWith(IRONAAI_API_KEY_PREFIX)
    ) {
      throw new MissingApiKeyError(
        "The provided API key is invalid. Please generate a new key at 'https://app.irona.ai/dashboard/api-keys'."
      );
    }

    const normalizedConfig: Config = {
      ...config,
      baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
      gateway: this.resolveGatewayConfig(config.gateway),
    };

    this.ironaRouter = new IronaRouterClient(normalizedConfig);
    this.llmChatService = new IronaChatClient(
      normalizedConfig,
      this.ironaRouter
    );
  }

  // Static factory method to handle async initialization
  public static async createInstance(config: Config = {}): Promise<IronaAI> {
    await this.ensureProvidersLoaded();
    return new IronaAI(config);
  }

  private static async ensureProvidersLoaded(
    retries = 3,
    delay = 1000
  ): Promise<void> {
    const SUPPORTED_MODELS_GIST_URL =
      process.env.SUPPORTED_MODELS_URL ?? SUPPORTED_MODELS_DEFAULT_URL;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await updateProvidersFromGist(SUPPORTED_MODELS_GIST_URL);
        return;
      } catch (error) {
        logger.warn(
          `Attempt ${attempt} to load Supported Models details failed. Retrying... ${error}`
        );
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, delay));
        }
      }
    }

    throw new Error(
      'Cannot instantiate IronaAI as it failed to load Supported Models details from Gist after multiple attempts. Please provide correct value of environment key SUPPORTED_MODELS_URL or leave it undefined.'
    );
  }

  private resolveGatewayConfig(
    configuredGateway?: GatewayConfig
  ): GatewayConfig | undefined {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const defaultOpenRouterBaseUrl =
      openRouterApiKey !== undefined && openRouterApiKey !== ''
        ? 'https://openrouter.ai/api/v1'
        : undefined;
    const gatewayBaseUrl =
      configuredGateway?.baseUrl ??
      process.env.LLM_GATEWAY_BASE_URL ??
      process.env.OPENROUTER_BASE_URL ??
      defaultOpenRouterBaseUrl;
    const gatewayApiKey =
      configuredGateway?.apiKey ??
      process.env.LLM_GATEWAY_API_KEY ??
      process.env.OPENROUTER_API_KEY;

    if (
      gatewayBaseUrl !== undefined &&
      gatewayBaseUrl !== '' &&
      (gatewayApiKey === undefined || gatewayApiKey === '')
    ) {
      throw new MissingApiKeyError(
        'Gateway base URL is configured but no gateway API key is set. Provide `config.gateway.apiKey` or set `LLM_GATEWAY_API_KEY`/`OPENROUTER_API_KEY`.'
      );
    }

    if (
      (gatewayBaseUrl === undefined || gatewayBaseUrl === '') &&
      gatewayApiKey !== undefined &&
      gatewayApiKey !== ''
    ) {
      throw new MissingApiKeyError(
        'Gateway API key is configured but no gateway base URL is set. Provide `config.gateway.baseUrl` or set `LLM_GATEWAY_BASE_URL`/`OPENROUTER_BASE_URL`.'
      );
    }

    if (
      gatewayBaseUrl === undefined ||
      gatewayBaseUrl === '' ||
      gatewayApiKey === undefined ||
      gatewayApiKey === ''
    ) {
      return undefined;
    }

    // Validate gateway URL is HTTPS to prevent SSRF
    try {
      const parsedUrl = new URL(gatewayBaseUrl);
      if (parsedUrl.protocol !== 'https:') {
        throw new MissingApiKeyError(
          `Gateway base URL must use HTTPS. Got: ${parsedUrl.protocol}`
        );
      }
    } catch (error) {
      if (error instanceof MissingApiKeyError) throw error;
      throw new MissingApiKeyError(
        `Invalid gateway base URL: ${gatewayBaseUrl}`
      );
    }

    const gatewayHeaders: Record<string, string> = {
      ...(configuredGateway?.headers ?? {}),
    };

    if (
      gatewayHeaders['HTTP-Referer'] === undefined &&
      process.env.OPENROUTER_HTTP_REFERER !== undefined &&
      process.env.OPENROUTER_HTTP_REFERER !== ''
    ) {
      gatewayHeaders['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
    }
    if (
      gatewayHeaders['X-Title'] === undefined &&
      process.env.OPENROUTER_X_TITLE !== undefined &&
      process.env.OPENROUTER_X_TITLE !== ''
    ) {
      gatewayHeaders['X-Title'] = process.env.OPENROUTER_X_TITLE;
    }

    const providerName =
      configuredGateway?.providerName ?? process.env.LLM_GATEWAY_PROVIDER_NAME;
    const includeProviderInModelNameEnv =
      process.env.LLM_GATEWAY_INCLUDE_PROVIDER_IN_MODEL_NAME;
    const includeProviderInModelName =
      configuredGateway?.includeProviderInModelName ??
      (typeof includeProviderInModelNameEnv === 'string'
        ? includeProviderInModelNameEnv.toLowerCase() !== 'false'
        : undefined);

    return {
      ...configuredGateway,
      baseUrl: gatewayBaseUrl,
      apiKey: gatewayApiKey,
      headers:
        Object.keys(gatewayHeaders).length > 0 ? gatewayHeaders : undefined,
      providerName,
      includeProviderInModelName,
    };
  }

  public modelSelect(body: ModelSelectPayload): Promise<ModelSelectResponse> {
    return this.ironaRouter.modelSelect(body);
  }

  public completions = {
    create: (body: CompletionsPayload): Promise<CompletionsResponse> => {
      return this.llmChatService.completions(body);
    },
  };
}
