import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { mistral } from '@ai-sdk/mistral';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import { togetherai } from '@ai-sdk/togetherai';
import { xai } from '@ai-sdk/xai';
import type { ModelMessage, LanguageModel } from 'ai';
import { generateText, streamText, stepCountIs } from 'ai';

import { BadRequestError, MissingApiKeyError } from '../errors';
import type { Router } from '../router/types';
import type { ProviderName } from '../responseTypes';
import { CompletionsResponse } from '../responseTypes';
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
import type { Config, GatewayConfig } from '../types';
import { SUPPORTED_MODELS_DEFAULT_URL } from '../utils/constants';
import { logger } from '../utils/logger';
import {
  extractMediaTypeArrayFromMessages,
  validateAndGetProviderAndModel,
} from '../utils/providerAndModelUtils';
import { ReasoningConfig } from '../utils/reasoningConfig';
import type { ReasoningEffort } from '../utils/reasoningConfig';
import { validateSchema } from '../utils/requestValidator';
export { CompletionsResponse };

export class IronaChatClient {
  private readonly gatewayProvider?: ReturnType<typeof createOpenAI>;
  private readonly gatewayHostname?: string;

  constructor(
    private readonly config: Config,
    private readonly ironaRouter: Router
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
    // If `fallback_models` is provided in the `completions()` function payload, they will take precedence over `config.fallback_models` for model prioritization.
    const modelPriorityQueue = [
      ...(provider !== null && model !== null ? [{ provider, model }] : []),
      ...(payload.fallback_models ?? this.config.fallback_models ?? []).map(
        fallback => validateAndGetProviderAndModel(fallback)
      ),
    ];

    // Attempt execution for each model in the priority queue
    let attemptNumber = 1;
    for (const { provider, model } of modelPriorityQueue) {
      logger.info(
        `[IronaChatClient][completions] Attempt ${attemptNumber}: Invoking chat completions with provider: ${provider}, model: ${model}`
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
          `[IronaChatClient][completions] Attempt ${attemptNumber}: Successfully executed chat completions with provider: ${provider}, model: ${model}`
        );
        return response; // Return on first success
      } catch (error) {
        logger.error(
          `\n[IronaChatClient][completions] Attempt ${attemptNumber}: Error with ${provider}/${model}: ${
            (error as Error).message
          }`
        );
      }
      attemptNumber++;
    }
    // If all retries fail, throw an error
    throw new Error(
      `[IronaChatClient][completions] All attempts to process the completions request failed. Please verify the providers and models in your configuration.`
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

      const modelFactory = this.getModelInstance(
        provider,
        fullModelName,
        payload.reasoning_effort,
        isUsingGateway
      );

      if (!modelFactory) {
        throw new Error(`No model factory found for provider: ${provider}`);
      }

      const baseModel = modelFactory(fullModelName);
      const finalModel = baseModel;

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

      // Add search tools if search is enabled
      if (
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
          payload.reasoning_effort
        );
      };

      if (payload.stream === true) {
        const streamConfig = (
          payload.reasoning_effort
            ? applyReasoningConfig({
                ...baseConfig,
              })
            : {
                ...baseConfig,
              }
        ) as Parameters<typeof streamText>[0];

        const stream = await streamText(streamConfig);

        // Eagerly test the stream by consuming multiple chunks to catch errors early
        const iterator = stream.fullStream[Symbol.asyncIterator]();
        const testResults: unknown[] = [];
        try {
          // Test the first few chunks to ensure the stream is working
          for (let i = 0; i < 3; i++) {
            const result = await iterator.next();

            if (result.done === true) {
              if (i === 0) {
                throw new Error(
                  `Empty stream response from ${provider}/${model}`
                );
              }
              break;
            }

            if (result.value?.type === 'error') {
              const err = result.value.error as {
                name?: string;
                statusCode?: number;
                message?: string;
              };
              throw new Error(`${err.name} (status ${err.statusCode})`);
            }

            testResults.push(result.value);
          }
        } catch (error) {
          // If we get an error during the early test, propagate it up to trigger fallbacks
          logger.error(
            `[IronaChatClient] Stream validation failed for ${provider}/${model}: ${error}`
          );
          throw error;
        }

        // Create a new stream that includes the pre-fetched results
        const fullStream = {
          async *[Symbol.asyncIterator]() {
            try {
              // Yield the pre-fetched results first
              for (const result of testResults) {
                yield result;
              }
              // Continue with the rest of the stream
              for await (const part of stream.fullStream) {
                if (part.type === 'error') {
                  // logger.error(`Stream yielded error for ${provider}/${model}:`, part.error);
                  const err = part.error as {
                    name?: string;
                    statusCode?: number;
                  };
                  throw new Error(`${err.name} (status ${err.statusCode})`);
                }
                yield part;
              }
            } catch (err) {
              logger.error(
                `[IronaChatClient][completions][invokeChatCompletions] Stream failed for ${provider}/${model}: ${err}`
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
          payload.reasoning_effort
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
            `[IronaChatClient] Non-stream request failed for ${provider}/${model}: ${error}`
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

    // Map of provider to their respective model functions
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

    return createOpenAI({
      baseURL: gateway.baseUrl,
      apiKey: gateway.apiKey,
      headers: gateway.headers,
      name: gateway.providerName ?? 'gateway',
    });
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
      `[IronaChatClient][selectBestModel] Models provided: ${
        body.models?.length || 0
      }, calling model-select endpoint`
    );
    try {
      const response = await this.ironaRouter.modelSelect(
        this.extractModelSelectPayloadFromCompletionsPayload(body)
      );

      // Handle errors from the model selection
      // Not using fallbacks here to remove duplicacy as they are added in model priority queue
      if (response.error !== null && response.error !== undefined) {
        logger.warn(
          `[IronaChatClient][selectBestModel][IronaML] Model selection error: ${JSON.stringify(
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
        `[IronaChatClient][selectBestModel] Model selection error: ${
          (error as Error).message
        }`
      );
      return { provider: null, model: null };
    }
  }

  private loadApiKeyForProvider(provider: string, model: string) {
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
