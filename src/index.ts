import { MissingApiKeyError } from './errors';
import { IronlabsChatClient } from './ironlabs-chat-client/IronlabsChatClient';
import type { CompletionsResponse } from './ironlabs-chat-client/IronlabsChatClient';
import type { ModelSelectResponse } from './ironlabs-router-client/IronlabsRouterClient';
import { createRouter } from './router/factory';
import type { Router } from './router/types';
import type { CompletionsPayload } from './schemas/completions.schema';
import type { ModelSelectPayload } from './schemas/modelSelect.schema';
import { updateProvidersFromGist } from './supported_models';
import type { Config, GatewayConfig } from './types';
import {
  IRONLABS_AI_API_KEY_PREFIX,
  DEFAULT_BASE_URL,
  LLM_GATEWAY_DEFAULT_BASE_URL,
  OPENROUTER_DEFAULT_BASE_URL,
  SUPPORTED_MODELS_DEFAULT_URL,
} from './utils/constants';
import { detectGatewayTypeFromUrl } from './utils/gatewayType';
import { logger } from './utils/logger';
require('dotenv').config();

// Aliases for prior package names — keep these for migration code paths.
export class IronlabsAI {
  private static providersLoadedPromise: Promise<void> | null = null;
  private ironlabsRouter: Router;
  private llmChatService: IronlabsChatClient;
  private constructor(config: Config = {}) {
    // Check for API key — accepts IRONLABS_API_KEY (preferred), legacy IRONLABS_AI_API_KEY,
    // and IRONAAI_API_KEY (oldest). Older names log a deprecation warning on use.
    const apiKey =
      config.apiKey ??
      process.env.IRONLABS_API_KEY ??
      process.env.IRONLABS_AI_API_KEY ??
      process.env.IRONAAI_API_KEY ??
      '';
    const hasPrimaryKey =
      (config.apiKey ?? '') !== '' ||
      (process.env.IRONLABS_API_KEY ?? '') !== '';
    const hasDeprecatedKey =
      (process.env.IRONLABS_AI_API_KEY ?? '') !== '' ||
      (process.env.IRONAAI_API_KEY ?? '') !== '';
    if (!hasPrimaryKey && hasDeprecatedKey) {
      logger.warn(
        'IRONLABS_AI_API_KEY / IRONAAI_API_KEY are deprecated. Set IRONLABS_API_KEY instead.'
      );
    }
    if (!apiKey) {
      throw new MissingApiKeyError(
        "The API key is missing. Please provide the API key either through the 'IRONLABS_API_KEY' environment variable or the 'config.apiKey' property."
      );
    }
    if (
      typeof apiKey !== 'string' ||
      !apiKey.startsWith(IRONLABS_AI_API_KEY_PREFIX)
    ) {
      throw new MissingApiKeyError(
        "The provided API key is invalid. Please generate a new key at 'https://app.ironlabs.ai/dashboard/api-keys'."
      );
    }

    const normalizedConfig: Config = {
      ...config,
      baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
      gateway: this.resolveGatewayConfig(config.gateway),
    };

    this.ironlabsRouter = createRouter(normalizedConfig);
    this.llmChatService = new IronlabsChatClient(
      normalizedConfig,
      this.ironlabsRouter
    );
  }

  // Static factory method to handle async initialization
  public static async createInstance(config: Config = {}): Promise<IronlabsAI> {
    IronlabsAI.providersLoadedPromise ??= this.ensureProvidersLoaded();
    await IronlabsAI.providersLoadedPromise;
    return new IronlabsAI(config);
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
      'Cannot instantiate IronlabsAI as it failed to load Supported Models details from Gist after multiple attempts. Please provide correct value of environment key SUPPORTED_MODELS_URL or leave it undefined.'
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
    // used here AND in IronlabsChatClient.
    const gatewayType = detectGatewayTypeFromUrl(gatewayBaseUrl);
    const gatewayApiKey =
      configuredGateway?.apiKey ??
      (gatewayType === 'llmgateway'
        ? llmGatewayApiKey
        : gatewayType === 'openrouter'
          ? openRouterApiKey
          : commonGatewayApiKey) ??
      commonGatewayApiKey;

    if (
      gatewayBaseUrl !== undefined &&
      gatewayBaseUrl !== '' &&
      (gatewayApiKey === undefined || gatewayApiKey === '')
    ) {
      const specificKeyHint =
        gatewayType === 'llmgateway'
          ? '`LLM_GATEWAY_API_KEY`'
          : gatewayType === 'openrouter'
            ? '`OPENROUTER_API_KEY`'
            : '`GATEWAY_API_KEY`';
      throw new MissingApiKeyError(
        `Gateway base URL is configured (detected gateway: ${gatewayType}) but no API key is set. ` +
          `Provide \`config.gateway.apiKey\`, ${specificKeyHint}, or \`GATEWAY_API_KEY\` (common).`
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

    if (gatewayType === 'openrouter') {
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
    return this.ironlabsRouter.modelSelect(body);
  }

  public completions = {
    create: (body: CompletionsPayload): Promise<CompletionsResponse> => {
      return this.llmChatService.completions(body);
    },
  };
}

/**
 * Canonical export — matches the `ironlabs` package name (v2.0.0+).
 */
export { IronlabsAI as IronLabs };

/**
 * @deprecated Use `IronLabs` instead. This alias is kept for backwards
 * compatibility with the old `ironaai` / `ironlabsai` packages and will be
 * removed in a future major version.
 */
export { IronlabsAI as IronaAI };
