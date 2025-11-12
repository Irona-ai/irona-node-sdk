import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic, AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { perplexity } from "@ai-sdk/perplexity";
import { togetherai } from "@ai-sdk/togetherai";
import { Config } from "../types";
import { BadRequestError, MissingApiKeyError } from "../errors";
import {
  doesModelSupportMediaTypes,
  providerApiKeyName,
  doesModelSupportWebSearch,
  getModelPrefix,
} from "../supported_models";
import { validateSchema } from "../utils/requestValidator";
import {
  CompletionsPayload,
  CompletionsSchema,
} from "../schemas/completions.schema";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../schemas/modelSelect.schema";
import { IronaRouterClient } from "../irona-router-client/IronaRouterClient";
import {
  extractMediaTypeArrayFromMessages,
  getSupportedProviderAndModelArray,
  validateAndGetProviderAndModel,
} from "../utils/providerAndModelUtils";
import { MessagePayload } from "../schemas/common.schema";
import { SUPPORTED_MODELS_DEFAULT_URL } from "../utils/constants";
import { ReasoningConfig, ReasoningEffort } from "../utils/reasoningConfig";
import { xai } from "@ai-sdk/xai";

type ProviderName =
  | "google"
  | "openai"
  | "anthropic"
  | "togetherai"
  | "mistral"
  | "perplexity"
  | "xai";
export class IronaChatClient {
  constructor(
    private readonly config: Config,
    private readonly ironaRouter: IronaRouterClient
  ) {}

  /**
   * Processes a completions request and retries with fallback models if necessary.
   */
  async completions(payload: CompletionsPayload) {
    // Validate input
    const validationResult = validateSchema(CompletionsSchema, payload);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    // Select the best model
    const { provider, model } = await this.selectBestModel(payload);

    // Prepare the model priority queue
    // If `fallback_models` is provided in the `completions()` function payload, they will take precedence over `config.fallback_models` for model prioritization.
    const modelPriorityQueue = [
      ...(provider && model ? [{ provider, model }] : []),
      ...(payload.fallback_models ?? this.config.fallback_models ?? []).map(
        (fallback) => validateAndGetProviderAndModel(fallback)
      ),
    ];

    // Attempt execution for each model in the priority queue
    let attemptNumber = 1;
    for (const { provider, model } of modelPriorityQueue) {
      console.log(
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
        console.log(
          `[IronaChatClient][completions] Attempt ${attemptNumber}: Successfully executed chat completions with provider: ${provider}, model: ${model}`
        );
        return response; // Return on first success
      } catch (error) {
        console.error(
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

  /**
   * Handles the invocation of chat completions to a specific provider and model.
   */
  private async invokeChatCompletions(
    provider: string,
    model: string,
    payload: CompletionsPayload,
    supportsWebSearch: boolean
  ) {
    try {
      const apiKey = this.loadApiKeyForProvider(provider, model);

      // Convert messages to Vercel AI SDK format
      const vercelMessages = this.convertToVercelMessages(payload.messages);

      let fullModelName = model;
      if (provider === "togetherai") {
        const modelPrefix = getModelPrefix(provider, model);
        if (modelPrefix) {
          fullModelName = `${modelPrefix}/${model}`;
        }
      }

      const modelFactory = this.getModelInstance(
        provider,
        fullModelName,
        payload.reasoning_effort
      );

      if (!modelFactory) {
        throw new Error(`No model factory found for provider: ${provider}`);
      }

      const baseModel = modelFactory(fullModelName);
      let finalModel = baseModel;

      // Prepare base configuration
      const baseConfig = {
        model: finalModel,
        messages: vercelMessages,
        temperature: payload.temperature,
        maxOutputTokens: payload.maxTokens,
      };

      // Handle tools from payload
      let tools = payload.tools ? { ...payload.tools } : {};

      // Add search tools if search is enabled
      if (provider === "openai" && payload.search && supportsWebSearch) {
        tools = { ...tools, web_search_preview: openai.tools.webSearch({}) };
      }

      if (provider === "google" && payload.search && supportsWebSearch) {
        tools = { ...tools, google_search: google.tools.googleSearch({}) };
      }

      // Add tools to config if there are any
      if (Object.keys(tools).length > 0) {
        (baseConfig as any).tools = tools;
      }

      if (provider === "xai" && payload.search && supportsWebSearch) {
        (baseConfig as any).providerOptions = {
          xai: {
            searchParameters: {
              mode: "on",
            },
          },
        };
      }
      // Helper function to apply reasoning configuration
      const applyReasoningConfig = (config: any): any => {
        if (
          provider === "togetherai" ||
          provider === "mistral" ||
          provider === "perplexity"
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

      if (payload.stream) {
        const streamConfig: Parameters<typeof streamText>[0] =
          payload.reasoning_effort
            ? applyReasoningConfig({
                ...baseConfig,
              })
            : {
                ...baseConfig,
              };

        const stream = await streamText(streamConfig);

        // Eagerly test the stream by consuming multiple chunks to catch errors early
        const iterator = stream.fullStream[Symbol.asyncIterator]();
        const testResults: any = [];
        try {
          // Test the first few chunks to ensure the stream is working
          for (let i = 0; i < 3; i++) {
            const result = await iterator.next();

            if (result.done) {
              if (i === 0) {
                throw new Error(
                  `Empty stream response from ${provider}/${model}`
                );
              }
              break;
            }

            if (result.value?.type === "error") {
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
          console.error(
            `[IronaChatClient] Stream validation failed for ${provider}/${model}:`,
            error
          );
          throw error;
        }

        // Create a new stream that includes the pre-fetched results
        const fullStream = {
          [Symbol.asyncIterator]: async function* () {
            try {
              // Yield the pre-fetched results first
              for (const result of testResults) {
                yield result;
              }
              // Continue with the rest of the stream
              for await (const part of stream.fullStream) {
                if (part.type === "error") {
                  // console.error(`Stream yielded error for ${provider}/${model}:`, part.error);
                  const err = part.error as {
                    name?: string;
                    statusCode?: number;
                  };
                  throw new Error(`${err.name} (status ${err.statusCode})`);
                }
                yield part;
              }
            } catch (err) {
              console.error(
                `[IronaChatClient][completions][invokeChatCompletions] Stream failed for ${provider}/${model}:`,
                err
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
        const generateConfig: Parameters<typeof generateText>[0] =
          payload.reasoning_effort
            ? applyReasoningConfig({
                ...baseConfig,
              })
            : {
                ...baseConfig,
              };
        try {
          const response = await generateText(generateConfig);
          return {
            response: {
              content: response.text,
              reasoningContent: response.reasoning,
              role: "assistant",
            },
            provider,
            model,
          };
        } catch (error) {
          console.error(
            `[IronaChatClient] Non-stream request failed for ${provider}/${model}:`,
            error
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
  private convertToVercelMessages(messages: MessagePayload[]): any[] {
    return messages.map((msg, index) => {
      if (typeof msg.content === "string") {
        return {
          id: `msg-${index}`,
          role: msg.role,
          content: msg.content,
        };
      }

      const parts = msg.content.map((part) => {
        if (part.type === "text") {
          return {
            type: "text",
            text: part.text,
          } as const;
        } else if (part.type === "image_url") {
          return {
            type: "image",
            image: part.image_url.url,
          } as const;
        } else if (part.type === "document") {
          return {
            type: "file",
            url: part.source.url,
            mediaType: "application/pdf",
          } as const;
        } else if (part.type === "tool-result") {
          return {
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.result,
          } as const;
        } else if (part.type === "tool-call") {
          return {
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.toolInput,
          } as const;
        } else {
          throw new Error(
            `Unsupported message part type: ${(part as any).type}`
          );
        }
      });

      return {
        id: `msg-${index}`,
        role: msg.role,
        content: parts,
      };
    });
  }

  /**
   * Gets the appropriate model instance
   */
  private getModelInstance(
    provider: string,
    model: string,
    reasoningEffort?: ReasoningEffort
  ) {
    // Map of provider to their respective model functions
    const providerModels = {
      openai: openai,
      anthropic: anthropic,
      google: google,
      mistral: mistral,
      perplexity: perplexity,
      togetherai: togetherai,
      xai: xai,
    };
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

  private extractModelSelectPayloadFromCompletionsPayload(
    body: CompletionsPayload
  ): ModelSelectPayload {
    const modelSelectBody: any = {};

    // Get the keys from ModelSelectSchema
    const modelSelectKeys = Object.keys(
      ModelSelectSchema.shape
    ) as (keyof ModelSelectPayload)[];

    // Extract only the matching keys from CompletionsPayload
    modelSelectKeys.forEach((key) => {
      if (key in body) {
        modelSelectBody[key] = body[key];
      }
    });

    return modelSelectBody;
  }

  private async selectBestModel(body: CompletionsPayload) {
    console.log(
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
      if (response && response.error) {
        console.warn(
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
      console.error(
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
    if (!apiKey) {
      throw new MissingApiKeyError(
        `The environment variable ${apiKeyName} is missing or empty. Please ensure that ${apiKeyName} is set in the environment variables for the ${provider}/${model} model.`
      );
    }
    return apiKey;
  }
}
