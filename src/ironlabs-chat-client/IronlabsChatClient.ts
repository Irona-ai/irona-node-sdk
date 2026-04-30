import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createMistral, mistral } from '@ai-sdk/mistral';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { createPerplexity, perplexity } from '@ai-sdk/perplexity';
import { createTogetherAI, togetherai } from '@ai-sdk/togetherai';
import { createXai, xai } from '@ai-sdk/xai';
import type { LanguageModel, ModelMessage } from 'ai';
import {
  extractReasoningMiddleware,
  generateText,
  stepCountIs,
  streamText,
  wrapLanguageModel,
} from 'ai';

import { BadRequestError, MissingApiKeyError } from '../errors';
import type { ProviderName } from '../responseTypes';
import { CompletionsResponse } from '../responseTypes';
import type { Router } from '../router/types';
import type { MessagePayload } from '../schemas/common.schema';
import { CompletionsSchema } from '../schemas/completions.schema';
import type { CompletionsPayload } from '../schemas/completions.schema';
import { ModelSelectSchema } from '../schemas/modelSelect.schema';
import type { ModelSelectPayload } from '../schemas/modelSelect.schema';
import {
  providerApiKeyName,
  doesModelSupportMediaTypes,
  doesModelSupportWebSearch,
  getModelPrefix,
  getOpenRouterIdentifier,
} from '../supported_models';
import type { Config, GatewayConfig, ProviderConfig } from '../types';
import { SUPPORTED_MODELS_DEFAULT_URL } from '../utils/constants';
import { logger } from '../utils/logger';
import { createOpenRouterFetchWrapper } from '../utils/openRouterFetchWrapper';
import { buildOpenRouterExtraBody } from '../utils/openRouterMapper';
import type { OpenRouterExtraBody } from '../utils/openRouterMapper';
import {
  extractMediaTypeArrayFromMessages,
  validateAndGetProviderAndModel,
} from '../utils/providerAndModelUtils';
import { ReasoningConfig } from '../utils/reasoningConfig';
import type { ReasoningEffort } from '../utils/reasoningConfig';
import { validateSchema } from '../utils/requestValidator';
export { CompletionsResponse };

export class IronlabsChatClient {
  private readonly gatewayProvider?: ReturnType<typeof createOpenAI>['chat'];
  private readonly gatewayHostname?: string;

  constructor(
    private readonly config: Config,
    private readonly IronlabsRouter: Router
  ) {
    this.gatewayProvider = this.createGatewayProvider(this.config.gateway);
    if (this.config.gateway !== undefined) {
      this.gatewayHostname = new URL(
        this.config.gateway.baseUrl
      ).hostname.toLowerCase();
    }
  }

  /**
   * Processes a completions request and retries with fallback models if necessary.
   */
  async completions(payload: CompletionsPayload): Promise<CompletionsResponse> {
    // Validate input
    const validationResult = validateSchema(CompletionsSchema, payload);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    const selectedModel =
      payload.models.length === 1
        ? this.selectSingleModel(payload)
        : await this.selectBestModel(payload);
    const { provider, model } = selectedModel;

    // Prepare the model priority queue
    // If `fallbackModels` is provided in the `completions()` function payload, they will take precedence over `config.fallbackModels` for model prioritization.
    const modelPriorityQueue = [
      ...(provider !== null && model !== null ? [{ provider, model }] : []),
      ...(payload.fallbackModels ?? this.config.fallbackModels ?? []).map(
        fallback => validateAndGetProviderAndModel(fallback)
      ),
    ];

    // Attempt execution for each model in the priority queue
    let attemptNumber = 1;
    for (const { provider, model } of modelPriorityQueue) {
      logger.info(
        `[IronlabsChatClient][completions] Attempt ${attemptNumber}: Invoking chat completions with provider: ${provider}, model: ${model}`
      );
      try {
        const supportsWebSearch = doesModelSupportWebSearch(provider, model);
        const response = await this.invokeChatCompletions(
          provider,
          model,
          payload,
          supportsWebSearch
        );
        logger.info(
          `[IronlabsChatClient][completions] Attempt ${attemptNumber}: Successfully executed chat completions with provider: ${provider}, model: ${model}`
        );
        return response; // Return on first success
      } catch (error) {
        logger.error(
          `\n[IronlabsChatClient][completions] Attempt ${attemptNumber}: Error with ${provider}/${model}: ${
            (error as Error).message
          }`
        );
      }
      attemptNumber++;
    }
    // If all retries fail, throw an error
    throw new Error(
      `[IronlabsChatClient][completions] All attempts to process the completions request failed. Please verify the providers and models in your configuration.`
    );
  }

  private selectSingleModel(body: CompletionsPayload) {
    const { provider, model } = validateAndGetProviderAndModel(body.models[0]);
    const mediaInputsArray = extractMediaTypeArrayFromMessages(body.messages);
    const supportsMediaTypes = doesModelSupportMediaTypes(
      provider,
      model,
      mediaInputsArray
    );

    if (!supportsMediaTypes) {
      throw new BadRequestError(
        `Model ${provider}/${model} does not support required media types: ${mediaInputsArray.join(
          ', '
        )}. Please choose a model that supports the requested media types. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }

    return { provider, model };
  }

  /**
   * Handles the invocation of chat completions to a specific provider and model.
   */
  private async invokeChatCompletions(
    provider: string,
    model: string,
    payload: CompletionsPayload,
    supportsWebSearch: boolean
  ): Promise<CompletionsResponse> {
    try {
      // When a gateway is configured, ALL providers route through it.
      // Provider-specific API keys are ignored for routing (BYOK is handled
      // at the gateway/account level, e.g. OpenRouter dashboard).
      const isUsingGateway = this.gatewayProvider !== undefined;
      if (!isUsingGateway) {
        this.loadApiKeyForProvider(provider, model);
      }

      // Convert messages to Vercel AI SDK format
      const vercelMessages = this.convertToVercelMessages(payload.messages);

      let fullModelName = model;
      if (!isUsingGateway && provider === 'togetherai') {
        const modelPrefix = getModelPrefix(provider, model);
        if (modelPrefix !== null && modelPrefix !== undefined) {
          fullModelName = `${modelPrefix}/${model}`;
        }
      }
      if (isUsingGateway) {
        fullModelName = this.resolveGatewayModelName(provider, fullModelName);
      }

      // Build OpenRouter-specific extra body when routing through OpenRouter
      const isOpenRouter = isUsingGateway && this.isOpenRouterGateway();
      let openRouterExtra: OpenRouterExtraBody | undefined;
      if (isOpenRouter) {
        openRouterExtra = buildOpenRouterExtraBody({
          reasoningEffort: payload.reasoningEffort,
          search: payload.search,
          supportsWebSearch,
        });
      }

      const modelFactory = isOpenRouter
        ? (this.getGatewayModelFactory(openRouterExtra) ??
          this.getModelInstance(
            provider,
            fullModelName,
            payload.reasoningEffort,
            isUsingGateway
          ))
        : this.getModelInstance(
            provider,
            fullModelName,
            payload.reasoningEffort,
            isUsingGateway
          );

      if (!modelFactory) {
        throw new Error(`No model factory found for provider: ${provider}`);
      }

      const baseModel = modelFactory(fullModelName);

      // When using OpenRouter with reasoning explicitly requested, the fetch wrapper
      // injects delta.reasoning as <think>…</think> tags. Wrap the model so the AI
      // SDK extracts those tags into reasoning-delta stream parts.
      // Mapper omits the reasoning field for 'off'/undefined, so its presence means active.
      const shouldExtractOpenRouterReasoning =
        isOpenRouter && openRouterExtra?.reasoning !== undefined;

      const finalModel = shouldExtractOpenRouterReasoning
        ? (wrapLanguageModel({
            model: baseModel as Parameters<
              typeof wrapLanguageModel
            >[0]['model'],
            middleware: extractReasoningMiddleware({ tagName: 'think' }),
          }) as LanguageModel)
        : baseModel;

      // Prepare base configuration
      const baseConfig: {
        model: LanguageModel;
        messages: ModelMessage[];
        temperature?: number;
        maxOutputTokens?: number;
        tools?: Parameters<typeof streamText>[0]['tools'];
        stopWhen?: Parameters<typeof streamText>[0]['stopWhen'];
        providerOptions?: Parameters<typeof streamText>[0]['providerOptions'];
      } = {
        model: finalModel,
        messages: vercelMessages,
        temperature: payload.temperature,
        maxOutputTokens: payload.maxTokens,
      };

      // Handle tools from payload
      let tools = payload.tools ? { ...payload.tools } : {};

      // Add search tools if search is enabled (skip for gateways — OpenRouter
      // handles search via plugins in the request body, not native tools)
      if (
        !isUsingGateway &&
        provider === 'openai' &&
        payload.search === true &&
        supportsWebSearch
      ) {
        tools = { ...tools, web_search_preview: openai.tools.webSearch({}) };
      }

      if (
        !isUsingGateway &&
        provider === 'google' &&
        payload.search === true &&
        supportsWebSearch
      ) {
        tools = { ...tools, google_search: google.tools.googleSearch({}) };
      }

      // Add tools to config if there are any
      if (Object.keys(tools).length > 0) {
        baseConfig.tools = tools as Parameters<typeof streamText>[0]['tools'];
      }

      // Enable multi-step calls only when payload.tools are provided
      if (payload.tools && Object.keys(payload.tools).length > 0) {
        baseConfig.stopWhen = stepCountIs(5);
      }

      if (
        !isUsingGateway &&
        provider === 'xai' &&
        payload.search === true &&
        supportsWebSearch
      ) {
        baseConfig.providerOptions = {
          xai: {
            searchParameters: {
              mode: 'on',
            },
          },
        };
      }
      // Helper function to apply reasoning configuration
      const applyReasoningConfig = (
        config: Record<string, unknown>
      ): Record<string, unknown> => {
        if (isUsingGateway) {
          return config;
        }
        if (
          provider === 'togetherai' ||
          provider === 'mistral' ||
          provider === 'perplexity'
        ) {
          // For these providers, reasoning is handled by middleware that comes under <think> xml, not provider options
          return config;
        }
        return ReasoningConfig.applyReasoningConfig(
          config,
          provider,
          model,
          payload.reasoningEffort
        );
      };

      if (payload.stream === true) {
        const streamConfig = (
          payload.reasoningEffort
            ? applyReasoningConfig({
                ...baseConfig,
              })
            : {
                ...baseConfig,
              }
        ) as Parameters<typeof streamText>[0];

        const stream = streamText(streamConfig);

        // Return the stream immediately — no early validation.
        // Errors are caught inline via the error-handling wrapper below
        // and will propagate up to completions() for fallback retry.
        const fullStream = {
          async *[Symbol.asyncIterator]() {
            let chunkCount = 0;
            try {
              for await (const part of stream.fullStream) {
                if (part.type === 'error') {
                  const err = part.error as {
                    name?: string;
                    statusCode?: number;
                    message?: string;
                  };
                  const errMsg =
                    err.message ?? err.name ?? JSON.stringify(part.error);
                  throw new Error(
                    `${errMsg}${err.statusCode !== undefined ? ` (status ${err.statusCode})` : ''}`
                  );
                }
                chunkCount++;
                yield part;
              }
              if (chunkCount === 0) {
                throw new Error(
                  `Empty stream response from ${provider}/${model}`
                );
              }
            } catch (err) {
              logger.error(
                `[IronlabsChatClient][completions][invokeChatCompletions] Stream failed for ${provider}/${model}: ${err}`
              );
              throw new Error(
                `Streaming failed for provider: ${provider}, model: ${model}.\n${
                  (err as Error).message
                }`
              );
            }
          },
        };

        return {
          response: { fullStream },
          provider,
          model,
        };
      } else {
        const generateConfig = (
          payload.reasoningEffort
            ? applyReasoningConfig({
                ...baseConfig,
              })
            : {
                ...baseConfig,
              }
        ) as Parameters<typeof generateText>[0];
        try {
          const response = await generateText(generateConfig);
          return {
            response: {
              content: response.text,
              reasoningContent: response.reasoning,
              role: 'assistant',
            },
            provider,
            model,
          };
        } catch (error) {
          logger.error(
            `[IronlabsChatClient] Non-stream request failed for ${provider}/${model}: ${error}`
          );
          throw error;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to execute chat completions for provider: ${provider}, model: ${model}.\n${
          (error as Error).message
        }\n`
      );
    }
  }

  /**
   * Converts messages to Vercel AI SDK format
   */
  private convertToVercelMessages(messages: MessagePayload[]): ModelMessage[] {
    return messages.map((msg): ModelMessage => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
        } as ModelMessage;
      }

      if (msg.role === 'user') {
        const parts = msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          } else if (part.type === 'image') {
            return { type: 'image' as const, image: part.image };
          } else if (part.type === 'file') {
            return {
              type: 'file' as const,
              data: part.data,
              mediaType: part.mediaType ?? 'application/pdf',
            };
          }
          throw new Error(
            `Unsupported user message part type: ${(part as { type: string }).type}`
          );
        });
        return { role: 'user', content: parts } as ModelMessage;
      }

      if (msg.role === 'assistant') {
        const parts = msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          } else if (part.type === 'reasoning') {
            return { type: 'reasoning' as const, text: part.text };
          } else if (part.type === 'file') {
            return {
              type: 'file' as const,
              data: part.data,
              mediaType: part.mediaType,
            };
          } else if (part.type === 'tool-call') {
            return {
              type: 'tool-call' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            };
          }
          throw new Error(
            `Unsupported assistant message part type: ${(part as { type: string }).type}`
          );
        });
        return { role: 'assistant', content: parts } as ModelMessage;
      }

      if (msg.role === 'tool') {
        const parts = msg.content.map(part => ({
          type: 'tool-result' as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        }));
        return { role: 'tool', content: parts } as ModelMessage;
      }

      throw new Error(
        `Unsupported message role: ${(msg as { role: string }).role}`
      );
    });
  }

  /**
   * Gets the appropriate model instance
   */
  private getModelInstance(
    provider: string,
    model: string,
    reasoningEffort?: ReasoningEffort,
    isUsingGateway = false
  ) {
    if (isUsingGateway && this.gatewayProvider) {
      return this.gatewayProvider;
    }

    // Check for programmatic provider config → create custom SDK instance
    const customInstance = this.createCustomProviderInstance(provider);
    if (customInstance !== undefined) {
      if (
        ReasoningConfig.supportsReasoningMiddleware(
          provider as ProviderName,
          model
        )
      ) {
        return (modelName: string) => {
          const baseModel = customInstance(modelName);
          return ReasoningConfig.createEnhancedModelWithReasoning(
            baseModel,
            reasoningEffort
          );
        };
      }
      return customInstance;
    }

    // Default provider instances (read API keys from env vars)
    const providerModels = {
      openai,
      anthropic,
      google,
      mistral,
      perplexity,
      togetherai,
      xai,
    };
    if (!(provider in providerModels)) {
      return undefined;
    }
    if (
      ReasoningConfig.supportsReasoningMiddleware(
        provider as ProviderName,
        model
      )
    ) {
      return (modelName: string) => {
        const baseModel =
          providerModels[provider as keyof typeof providerModels](modelName);
        return ReasoningConfig.createEnhancedModelWithReasoning(
          baseModel,
          reasoningEffort
        );
      };
    }
    return providerModels[provider as keyof typeof providerModels];
  }

  private createGatewayProvider(gateway?: GatewayConfig) {
    if (!gateway) {
      return undefined;
    }

    const provider = createOpenAI({
      baseURL: gateway.baseUrl,
      apiKey: gateway.apiKey,
      headers: gateway.headers,
      name: gateway.providerName ?? 'gateway',
    });
    // Use .chat to force the Chat Completions API (/chat/completions).
    // The default call uses the Responses API (/responses) which most
    // gateways (OpenRouter, etc.) do not support.
    return provider.chat;
  }

  private isOpenRouterGateway(): boolean {
    return (
      this.gatewayHostname === 'openrouter.ai' ||
      (this.gatewayHostname?.endsWith('.openrouter.ai') ?? false)
    );
  }

  /**
   * Returns the gateway model factory, optionally with a custom fetch wrapper
   * that merges OpenRouter-specific params into the request body.
   * When no extra body is needed, reuses the singleton gateway provider.
   */
  private getGatewayModelFactory(
    extraBody: OpenRouterExtraBody | undefined
  ): ReturnType<typeof createOpenAI>['chat'] | undefined {
    if (
      this.gatewayProvider === undefined ||
      this.config.gateway === undefined
    ) {
      return undefined;
    }
    if (extraBody === undefined) {
      return this.gatewayProvider;
    }
    return createOpenAI({
      baseURL: this.config.gateway.baseUrl,
      apiKey: this.config.gateway.apiKey,
      headers: this.config.gateway.headers,
      name: this.config.gateway.providerName ?? 'gateway',
      fetch: createOpenRouterFetchWrapper(extraBody),
    }).chat;
  }

  private resolveGatewayModelName(provider: string, model: string): string {
    const gateway = this.config.gateway;
    if (!gateway) {
      return model;
    }

    if (
      this.gatewayHostname === 'openrouter.ai' ||
      (this.gatewayHostname?.endsWith('.openrouter.ai') ?? false)
    ) {
      const openRouterModelName = getOpenRouterIdentifier(provider, model);
      if (openRouterModelName !== null && openRouterModelName !== '') {
        return openRouterModelName;
      }
    }

    const includeProviderInModelName =
      gateway.includeProviderInModelName ?? true;
    if (!includeProviderInModelName) {
      return model;
    }

    if (model.startsWith(`${provider}/`)) {
      return model;
    }

    return `${provider}/${model}`;
  }

  private extractModelSelectPayloadFromCompletionsPayload(
    body: CompletionsPayload
  ): ModelSelectPayload {
    const modelSelectBody = {} as ModelSelectPayload;

    // Get the keys from ModelSelectSchema
    const modelSelectKeys = Object.keys(
      ModelSelectSchema.shape
    ) as (keyof ModelSelectPayload)[];

    // Extract only the matching keys from CompletionsPayload
    modelSelectKeys.forEach(key => {
      if (key in body) {
        (modelSelectBody as Record<string, unknown>)[key] =
          body[key as keyof CompletionsPayload];
      }
    });

    return modelSelectBody;
  }

  private async selectBestModel(body: CompletionsPayload) {
    logger.info(
      `[IronlabsChatClient][selectBestModel] Models provided: ${
        body.models?.length || 0
      }, calling model-select endpoint`
    );
    try {
      const response = await this.IronlabsRouter.modelSelect(
        this.extractModelSelectPayloadFromCompletionsPayload(body)
      );

      // Handle errors from the model selection
      // Not using fallbacks here to remove duplicacy as they are added in model priority queue
      if (response.error !== null && response.error !== undefined) {
        logger.warn(
          `[IronlabsChatClient][selectBestModel][IronlabsML] Model selection error: ${JSON.stringify(
            response.error,
            null,
            2
          )}`
        );
        return { provider: null, model: null };
      }

      return response.providers[0];
    } catch (error) {
      logger.error(
        `[IronlabsChatClient][selectBestModel] Model selection error: ${
          (error as Error).message
        }`
      );
      return { provider: null, model: null };
    }
  }

  /**
   * Checks if a provider has a direct API key (programmatic config or env var).
   * @deprecated No longer used for routing decisions. When a gateway is
   * configured, all providers route through it regardless of direct keys.
   * Kept for potential diagnostic use.
   */
  private hasDirectProviderKey(provider: string): boolean {
    const providerConf = this.config.providers?.[provider];
    if (providerConf?.apiKey !== undefined && providerConf.apiKey !== '') {
      return true;
    }
    const envKeyName = providerApiKeyName(provider);
    if (envKeyName === undefined) {
      return false;
    }
    const envVal = process.env[envKeyName];
    return envVal !== undefined && envVal !== '';
  }

  /**
   * Creates a custom provider SDK instance when programmatic config (apiKey/baseUrl)
   * is provided. This avoids mutating process.env — each provider gets its own
   * SDK instance with the key baked in.
   */
  private createCustomProviderInstance(provider: string) {
    const providerConf: ProviderConfig | undefined =
      this.config.providers?.[provider];
    if (providerConf === undefined) {
      return undefined;
    }

    const opts: { apiKey: string; baseURL?: string } = {
      apiKey: providerConf.apiKey,
    };
    if (providerConf.baseUrl !== undefined && providerConf.baseUrl !== '') {
      opts.baseURL = providerConf.baseUrl;
    }

    switch (provider) {
      case 'openai':
        return createOpenAI(opts);
      case 'anthropic':
        return createAnthropic(opts);
      case 'google':
        return createGoogleGenerativeAI(opts);
      case 'mistral':
        return createMistral(opts);
      case 'perplexity':
        return createPerplexity(opts);
      case 'togetherai':
        return createTogetherAI(opts);
      case 'xai':
        return createXai(opts);
      default:
        return undefined;
    }
  }

  private loadApiKeyForProvider(provider: string, model: string) {
    // Check programmatic config first
    const providerConf = this.config.providers?.[provider];
    if (providerConf?.apiKey !== undefined && providerConf.apiKey !== '') {
      return providerConf.apiKey;
    }
    // Fall back to env var
    const apiKeyName = providerApiKeyName(provider);
    const apiKey = process.env[apiKeyName];
    if (apiKey === undefined || apiKey === '') {
      throw new MissingApiKeyError(
        `The environment variable ${apiKeyName} is missing or empty. Please ensure that ${apiKeyName} is set in the environment variables for the ${provider}/${model} model.`
      );
    }
    return apiKey;
  }
}
