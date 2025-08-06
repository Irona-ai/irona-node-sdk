import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { perplexity } from "@ai-sdk/perplexity";
import { togetherai } from "@ai-sdk/togetherai";
import { vertex } from "@ai-sdk/google-vertex";
import { Config } from "../types";
import { BadRequestError, MissingApiKeyError } from "../errors";
import { doesModelSupportMediaTypes, providerApiKeyName, doesModelSupportWebSearch, doesModelSupportImageGeneration } from "../supported_models";
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

export class IronaChatClient {
  constructor(
    protected readonly config: Config,
    protected readonly ironaRouter: IronaRouterClient
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
    for (const { provider, model } of modelPriorityQueue) {
      console.log(
        `[IronaChatClient][completions] Invoking chat completions with provider: ${provider}, model: ${model}`
      );
      try {
        const supportsWebSearch = doesModelSupportWebSearch(provider, model);
        const response = await this.invokeChatCompletions(
          provider,
          model,
          payload,
          supportsWebSearch
        );
        console.log(`[IronaChatClient][completions] Successfully executed chat completions with provider: ${provider}, model: ${model}`);
        return response; // Return on first success
      } catch (error) {
        console.error(`\n[IronaChatClient][completions] Error with ${provider}/${model}: ${(error as Error).message}`);
      }
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

      // Prepare request options
      const requestOptions = {
        model: modelInstance(model),
        messages: vercelMessages,
        temperature: payload.temperature,
        maxTokens: payload.maxTokens,
      } as Parameters<typeof streamText>[0];
      // Only add tools for OpenAI if search is true
      if (provider === "openai" && payload.search) {
        requestOptions.tools = { web_search_preview: openai.tools.webSearchPreview() };
      }

      if (payload.stream) {
        const stream = await streamText(requestOptions);

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
        const response = await generateText(requestOptions);
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
            image: new URL(part.image_url.url),
          } as const;
        } else if (part.type === "document") {
          return {
            type: "file",
            data: new URL(part.source.url),
            mimeType: "application/pdf",
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
      vertex: vertex, // Add Vertex AI support
    };
    // web search grounding is only supported for Google and OpenAI providers
    if (provider === "google") {
      const enableSearchGrounding = !!search && !!supportsWebSearch;
      return (modelName: string) => providerModels[provider](modelName, { useSearchGrounding: enableSearchGrounding });
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
    if (body.models && body.models.length === 1) {
      const mediaInputsArray = extractMediaTypeArrayFromMessages(body.messages);
      const supportedProviderAndModelArray = getSupportedProviderAndModelArray(body.models);
      const mediaSupportedProviderAndModelArray = supportedProviderAndModelArray.filter(({ provider, model }) => doesModelSupportMediaTypes(provider, model, mediaInputsArray));
      if(mediaSupportedProviderAndModelArray.length === 0) {
        throw new BadRequestError(
          `No valid providers found that support the media types ${mediaInputsArray.join(", ")}. Please ensure that the models are correctly formatted and support the required media types. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
        );
      }
    
      const webSearchSupportedProviderAndModelArray = supportedProviderAndModelArray.filter(({ provider, model }) => doesModelSupportWebSearch(provider, model));
      if (body.search && webSearchSupportedProviderAndModelArray.length === 0) {
        throw new BadRequestError(
          `No valid providers found that support web search. Please ensure that the models are correctly formatted and support the required capabilities. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
        );
      }  
      let finalProviderAndModelArray;
      if (body.search) {
        finalProviderAndModelArray = webSearchSupportedProviderAndModelArray;
      } else if (mediaInputsArray.length > 0) {
        finalProviderAndModelArray = mediaSupportedProviderAndModelArray;
      } else {
        // No search, no media: allow all models as "normal" text models
        finalProviderAndModelArray = supportedProviderAndModelArray;
      }

    // If no models available after filtering, throw error
    if (finalProviderAndModelArray.length === 0) {
      throw new BadRequestError(
        `No valid providers found after filtering. Please check your model requirements and supported capabilities. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }
  }
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

    protected loadApiKeyForProvider(provider: string, model: string) {
      if (provider === "vertex") {
        return this.loadVertexCredentials(provider, model);
      }
    const apiKeyName = providerApiKeyName(provider);
      if (!apiKeyName || typeof apiKeyName !== "string") {
        throw new MissingApiKeyError(
          `Missing or invalid API key name for ${provider}/${model}`
        );
      }
    const apiKey = process.env[apiKeyName];
    if (!apiKey) {
      throw new MissingApiKeyError(
        `The environment variable ${apiKeyName} is missing or empty. Please ensure that ${apiKeyName} is set in the environment variables for the ${provider}/${model} model.`
      );
    }
    return apiKey;
  }
  private loadVertexCredentials(provider: string, model: string) {
    console.log(`[IronaChatClient][loadVertexCredentials] Checking authentication for ${provider}/${model}`);
    
    // Only method supported by Vercel AI SDK: Service Account JSON file
    const googleApplicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (googleApplicationCredentials) {
      console.log(`[IronaChatClient][loadVertexCredentials] Using GOOGLE_APPLICATION_CREDENTIALS: ${googleApplicationCredentials}`);
      console.log(`[IronaChatClient][loadVertexCredentials] Service account JSON file detected`);
      return "vertex-configured";
    }
    // No valid credentials found
    console.log(`[IronaChatClient][loadVertexCredentials] GOOGLE_APPLICATION_CREDENTIALS not set`);
    throw new MissingApiKeyError(
      `Missing Google Cloud credentials for vertex/${model}. 
      
      Vercel AI SDK requires GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to your service account JSON file.
      
      Please set:
      export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
      
      Current value: ${googleApplicationCredentials || 'Not set'}`
    );
  }

}
