import { MissingApiKeyError } from './errors';
import { IronaChatClient } from './irona-chat-client/IronaChatClient';
import type { CompletionsResponse } from './irona-chat-client/IronaChatClient';
import type { ModelSelectResponse } from './irona-router-client/IronaRouterClient';
import { createRouter } from './router/factory';
import type { Router } from './router/types';
import type { CompletionsPayload } from './schemas/completions.schema';
import type { ModelSelectPayload } from './schemas/modelSelect.schema';
import { updateProvidersFromGist } from './supported_models';
import type { Config, GatewayConfig } from './types';
import {
  IRONAAI_API_KEY_PREFIX,
  DEFAULT_BASE_URL,
  LLM_GATEWAY_DEFAULT_BASE_URL,
  OPENROUTER_DEFAULT_BASE_URL,
  SUPPORTED_MODELS_DEFAULT_URL,
} from './utils/constants';
import { detectGatewayTypeFromUrl } from './utils/gatewayType';
import { logger } from './utils/logger';
require('dotenv').config();

export class IronaAI {
  private static providersLoadedPromise: Promise<void> | null = null;
  private ironaRouter: Router;
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

    this.ironaRouter = createRouter(normalizedConfig);
    this.llmChatService = new IronaChatClient(
      normalizedConfig,
      this.ironaRouter
    );
  }

  // Static factory method to handle async initialization
  public static async createInstance(config: Config = {}): Promise<IronaAI> {
    IronaAI.providersLoadedPromise ??= this.ensureProvidersLoaded();
    await IronaAI.providersLoadedPromise;
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
    // Canonical URL env var is `GATEWAY_BASE_URL` — works for ANY
    // OpenAI-compatible gateway. The SDK detects which flavour (OpenRouter vs
    // LLM Gateway vs other) from the hostname and picks the right API key
    // from the existing `OPENROUTER_API_KEY` / `LLM_GATEWAY_API_KEY` vars.
    //
    // Legacy `LLM_GATEWAY_BASE_URL` / `OPENROUTER_BASE_URL` are kept as
    // fallbacks. If no URL is set at all, OpenRouter is the default when
    // OPENROUTER_API_KEY is present.
    const llmGatewayApiKey = process.env.LLM_GATEWAY_API_KEY;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const commonGatewayApiKey = process.env.GATEWAY_API_KEY;
    const defaultLLMGatewayBaseUrl =
      llmGatewayApiKey !== undefined && llmGatewayApiKey !== ''
        ? LLM_GATEWAY_DEFAULT_BASE_URL
        : undefined;
    const defaultOpenRouterBaseUrl =
      openRouterApiKey !== undefined && openRouterApiKey !== ''
        ? OPENROUTER_DEFAULT_BASE_URL
        : undefined;
    const gatewayBaseUrl =
      configuredGateway?.baseUrl ??
      process.env.GATEWAY_BASE_URL ??
      process.env.LLM_GATEWAY_BASE_URL ??
      process.env.OPENROUTER_BASE_URL ??
      defaultOpenRouterBaseUrl ??
      defaultLLMGatewayBaseUrl;
    // Pair the API key with whichever base URL won above, so a user with both
    // OPENROUTER_API_KEY and LLM_GATEWAY_API_KEY set doesn't end up sending an
    // OpenRouter key to LLM Gateway (or vice versa). `detectGatewayTypeFromUrl`
    // is the single source of truth for which gateway a base URL points at —
    // used here AND in IronaChatClient.
    const gatewayType = detectGatewayTypeFromUrl(gatewayBaseUrl);
    const gatewayApiKey =
      configuredGateway?.apiKey ??
      (gatewayType === 'llmgateway'
        ? llmGatewayApiKey
        : gatewayType === 'openrouter'
          ? openRouterApiKey
          : commonGatewayApiKey) ??
      commonGatewayApiKey ??
      openRouterApiKey ??
      llmGatewayApiKey;

    if (
      gatewayBaseUrl !== undefined &&
      gatewayBaseUrl !== '' &&
      (gatewayApiKey === undefined || gatewayApiKey === '')
    ) {
      throw new MissingApiKeyError(
        'Gateway base URL is configured but no gateway API key is set. Provide `config.gateway.apiKey` or set `GATEWAY_API_KEY` (common) / `OPENROUTER_API_KEY` / `LLM_GATEWAY_API_KEY`.'
      );
    }

    if (
      (gatewayBaseUrl === undefined || gatewayBaseUrl === '') &&
      gatewayApiKey !== undefined &&
      gatewayApiKey !== ''
    ) {
      throw new MissingApiKeyError(
        'Gateway API key is configured but no gateway base URL is set. Provide `config.gateway.baseUrl` or set `GATEWAY_BASE_URL` (or the legacy `LLM_GATEWAY_BASE_URL` / `OPENROUTER_BASE_URL`).'
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
