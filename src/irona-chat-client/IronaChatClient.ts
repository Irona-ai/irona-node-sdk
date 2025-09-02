import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic, AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { perplexity } from "@ai-sdk/perplexity";
import { togetherai } from "@ai-sdk/togetherai";
import { Config } from "../types";
import { BadRequestError, MissingApiKeyError } from "../errors";
import { doesModelSupportMediaTypes, providerApiKeyName, doesModelSupportWebSearch } from "../supported_models";
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
import { extractMediaTypeArrayFromMessages, getSupportedProviderAndModelArray, validateAndGetProviderAndModel } from "../utils/providerAndModelUtils";
import { MessagePayload } from "../schemas/common.schema";
import { SUPPORTED_MODELS_DEFAULT_URL } from "../utils/constants";

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

export class IronaChatClient {
  constructor(
    private readonly config: Config,
    private readonly ironaRouter: IronaRouterClient
  ) { }

  private getReasoningConfig(
    provider: string,
    model: string,
    reasoningEffort: ReasoningEffort
  ): any {

    if (reasoningEffort === 'off') {
      return null;

    }
    if (provider === 'google' && model.includes("gemini")) {
      const budgetMap: Record<string, number> = {
        low: 512,
        medium: 1048,
        high: 2048,
        max: 4096,
        off: 0
      }
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: budgetMap[reasoningEffort],
            includeThoughts: budgetMap[reasoningEffort] === 0 ? false : true
          }
        }
      }
    }

    if (provider === "openai") {
      const effortMap = {
        low: "low",
        medium: "medium",
        high: "high",
        max: "max",
        off: "off"
      }
      return {
        openai: {
          reasoning: {
            effort: effortMap[reasoningEffort]
          }
        }
      }
    }
    if (provider === "anthropic" && model.includes("claude")) {
      const budgetMap: Record<string, number> = {
        off: 0,
        low: 2000,
        medium: 6000,
        high: 12000,
        max: 20000,
      }
      return {
        anthropic: {
          thinking: {
            type: budgetMap[reasoningEffort] === 0 ? "disabled" : "enabled",
            budgetTokens: budgetMap[reasoningEffort] === 0 ? undefined : budgetMap[reasoningEffort],
          },
        } satisfies AnthropicProviderOptions,
      }
    }
  }

  private doesModelSupportReasoning(model: string): boolean {
    const reasoningModels = ['gemini-2.5-flash', "o-3", "o3-mini", "gpt-5", "o1-mini", "claude-opus-4-20250514", "o4-mini"]
    return reasoningModels.some((reasoningModel => model.includes(reasoningModel.toLowerCase())))
  }

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
        console.log(`[IronaChatClient][completions] Attempt ${attemptNumber}: Successfully executed chat completions with provider: ${provider}, model: ${model}`);
        return response; // Return on first success
      } catch (error) {
        console.error(`\n[IronaChatClient][completions] Attempt ${attemptNumber}: Error with ${provider}/${model}: ${(error as Error).message}`);
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

      // Get the appropriate model instance
      const modelInstance = this.getModelInstance(provider, model, payload.search, supportsWebSearch);
      if (!modelInstance) {
        throw new Error(`No model instance found for provider: ${provider}`);
      }
    // Prepare base configuration
      const baseConfig = {
        model: modelInstance(model) as any,
        messages: vercelMessages,
        temperature: payload.temperature,
        maxOutputTokens: payload.maxTokens,
      };
      // Only add tools for OpenAI if search is true
      if (provider === "openai" && payload.search) {
        (baseConfig as any).tools = { web_search_preview: openai.tools.webSearchPreview({}) };
      }

      if (payload.stream) {
        const streamConfig: Parameters<typeof streamText>[0] = {
          ...baseConfig,
        };

        if (payload.reasoning_effort) {
          const supportsReasoning = this.doesModelSupportReasoning(model);

          if (supportsReasoning) {
            const reasoningConfig = this.getReasoningConfig(
              provider,
              model,
              payload.reasoning_effort,

            );
            if (reasoningConfig) {
              streamConfig.providerOptions = reasoningConfig;
              console.log(`[IronaChatClient] Applied reasoning config for ${provider}/${model}:`, reasoningConfig);
            }
          } else {
            console.warn(`[IronaChatClient] Reasoning not supported for ${provider}/${model}, ignoring reasoning_effort`);
          }
        }
        const stream = await streamText(streamConfig);

        // Eagerly check the first token to catch early errors (e.g., auth failure)
        const iterator = stream.fullStream[Symbol.asyncIterator]();
        const firstResult = await iterator.next();

        if (firstResult.value?.type === "error") {
          const err = firstResult.value.error;
          // console.error("[streamText]: "+err);
          throw new Error(err);
        }

        const fullStream = {
          [Symbol.asyncIterator]: async function* () {
            try {
              // Yield the first valid result
              if (!firstResult.done) {
                yield firstResult.value;
              }
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
                `Streaming failed for provider: ${provider}, model: ${model}.\n${(err as Error).message
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
        const response = await generateText(baseConfig as Parameters<typeof generateText>[0]);
        return {
          response: {
            content: response.text,
            role: "assistant",
          },
          provider,
          model,
        };
      }
    } catch (error) {
      throw new Error(
        `Failed to execute chat completions for provider: ${provider}, model: ${model}.\n${(error as Error).message
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
            data: part.source.url,
            mediaType: "application/pdf",
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
  private getModelInstance(provider: string, model: string, search?: boolean, supportsWebSearch?: boolean) {
    // Map of provider to their respective model functions
    const providerModels = {
      openai: openai,
      anthropic: anthropic,
      google: google,
      mistral: mistral,
      perplexity: perplexity,
      togetherai: togetherai,
    };
    // web search grounding is only supported for Google and OpenAI providers
    if (provider === "google") {
      const enableSearchGrounding = !!search && !!supportsWebSearch;
      return (modelName: string) => providerModels[provider](modelName);
    }
    if (provider === "openai") {
      const enableWebSearch = !!search && !!supportsWebSearch;
      if (enableWebSearch) {
        return (modelName: string) => openai.responses(modelName);
      } else {
        return (modelName: string) => openai(modelName);
      }
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
    console.log(`[IronaChatClient][selectBestModel] Models provided: ${body.models?.length || 0}, calling model-select endpoint`);
    try {
      const response = await this.ironaRouter.modelSelect(
        this.extractModelSelectPayloadFromCompletionsPayload(body)
      );

      // Handle errors from the model selection
      // Not using fallbacks here to remove duplicacy as they are added in model priority queue
      if (response && response.error) {
        console.warn(`[IronaChatClient][selectBestModel][IronaML] Model selection error: ${JSON.stringify(response.error, null, 2)}`);
        return { provider: null, model: null };
      }

      return response.providers[0];
    } catch (error) {
      console.error(`[IronaChatClient][selectBestModel] Model selection error: ${(error as Error).message}`);
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
