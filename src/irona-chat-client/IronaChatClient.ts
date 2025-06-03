import { ChatOpenAI } from "@langchain/openai";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatModelConfig, Config } from "../types";
import { MissingApiKeyError, BadRequestError } from "../errors";
import { providerApiKeyName } from "../supported_models";
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
import { validateAndGetProviderAndModel } from "../utils/validateAndGetProviderAndModel";
import { ChatPerplexity } from "../custom-chat-models/perplexity";
import { MessagePayload } from "../schemas/common.schema";
import { ChatPdfModel } from "../custom-chat-models/ChatPdfModel";

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
      return {
        error: validationResult.errors,
        error_trace: [
          {
            provider: null,
            model: null,
            error: validationResult.errors,
          },
        ],
      };
    }

    // Error trace to keep track of all errors encountered
    const errorTrace = [];

    try {
      // Select the best model
      const modelSelectResult = await this.selectBestModel(payload);

      if (modelSelectResult.error) {
        errorTrace.push({
          provider: null,
          model: null,
          error: `Model selection failed: ${modelSelectResult.error}`,
        });
      }

      const { provider, model } = modelSelectResult;

      // This is a temporary fix for pdf support untill we made 1. pdfchatmodel generic and 2. model select works for pdf/document
      const isPdfInput = this.containsDocumentInMessages(payload.messages);

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
          `Invoking chat completions with provider: ${provider}, model: ${model}`
        );
        try {
          const response = await this.invokeChatCompletions(
            provider,
            model,
            payload
          );
          console.log(
            `Successfully executed chat completions with provider: ${provider}, model: ${model}`
          );

          // If there were previous errors, include them in the response
          if (errorTrace.length > 0) {
            return {
              ...response,
              error_trace: errorTrace,
              recovered: true,
            };
          }

          return response; // Return on first success
        } catch (error) {
          // Add error to trace
          errorTrace.push({
            provider,
            model,
            error: (error as Error).message,
          });

          console.error(
            `Error with ${provider}/${model}: ${(error as Error).message}`
          );
        }
      }

      // If all retries fail, return a structured error response
      return {
        error:
          "All attempts to process the completions request failed. Please verify the providers and models in your configuration.",
        error_trace: errorTrace,
      };
    } catch (error) {
      // Catch any unexpected errors
      return {
        error: `Unexpected error: ${(error as Error).message}`,
        error_trace: [
          ...errorTrace,
          {
            provider: null,
            model: null,
            error: (error as Error).message,
          },
        ],
      };
    }
  }

  /**
   * Handles the invocation of chat completions to a specific provider and model.
   */
  private async invokeChatCompletions(
    provider: string,
    model: string,
    payload: CompletionsPayload
  ) {
    try {
      const apiKey = this.loadApiKeyForProvider(provider, model);

      const chatModelConfig: ChatModelConfig = {
        apiKey,
        modelName: model,
        temperature: payload?.temperature,
        maxRetries: payload?.maxRetries,
        maxTokens: payload?.maxTokens,
      };
      const isPdfInput = this.containsDocumentInMessages(payload.messages);
      const chatModel = isPdfInput
        ? this.getChatPdfModel(provider, chatModelConfig)
        : this.getChatModel(provider, chatModelConfig);
      if (!chatModel) {
        throw new Error(
          `No chat model instance found for provider: ${provider}`
        );
      }

      const messages = this.formatInputMessages(
        payload.messages,
        model,
        provider
      );

      if (payload.stream) {
        return {
          response: await chatModel.stream(messages),
          provider,
          model,
        };
      } else {
        return {
          response: await chatModel.invoke(messages),
          provider,
          model,
        };
      }
    } catch (error) {
      throw new Error(
        `Failed to execute chat completions for provider: ${provider}, model: ${model}.\n${
          (error as Error).message
        }`
      );
    }
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
      return validateAndGetProviderAndModel(body.models[0]);
    }

    try {
      const response = await this.ironaRouter.modelSelect(
        this.extractModelSelectPayloadFromCompletionsPayload(body)
      );

      // Handle errors from the model selection
      if (response && response.error) {
        // Still provide fallback providers for error recovery
        const providers = response.fallback_providers || [];
        if (providers.length > 0) {
          return providers[0];
        }
        return { provider: null, model: null, error: response.error };
      }

      return response.providers[0];
    } catch (error) {
      console.error(`Model selection error: ${(error as Error).message}`);
      return { provider: null, model: null, error: (error as Error).message };
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

  private getChatPdfModel(provider: string, chatModelConfig: ChatModelConfig) {
    if (provider !== "openai") {
      throw new BadRequestError(
        `PDF chat model is only supported for OpenAI provider.`
      );
    }
    return new ChatPdfModel(chatModelConfig);
  }
  private getChatModel(provider: string, chatModelConfig: ChatModelConfig) {
    switch (provider) {
      case "anthropic":
        return new ChatAnthropic(chatModelConfig);
      case "google":
        return new ChatGoogleGenerativeAI(chatModelConfig);
      case "mistral":
        return new ChatMistralAI(chatModelConfig);
      case "openai":
        return new ChatOpenAI(chatModelConfig);
      case "togetherai":
        return new ChatTogetherAI(chatModelConfig);
      case "perplexity":
        return new ChatPerplexity(chatModelConfig);
      default:
        throw new Error(`No chat model found for provider: ${provider}`);
    }
  }
  private containsDocumentInMessages(messages: MessagePayload[]): boolean {
    return messages.some(
      (message) =>
        Array.isArray(message.content) &&
        message.content.some((item) => item.type === "document")
    );
  }

  /**
   * Formats input messages for specific providers and models.
   *
   * - For Mistral models, it flattens message content to a single string by joining all "text" type content,
   *   as Mistral expects plain text content per message.
   * - For "o1" family models ("o1", "o1-mini", "o1-preview"), which do not support the "system" role,
   *   it remaps any "system" role to "user" to ensure compatibility.
   * - For all other models/providers, messages are returned unchanged.
   *
   * @param {MessagePayload[]} messages - The list of input messages, each with a role and content.
   * @param {string} model - The target model name, used to determine if special formatting is needed.
   * @param {string} provider - The provider name, used to apply provider-specific formatting.
   * @returns {MessagePayload[]} - The formatted messages, ready for the target provider/model.
   */
  private formatInputMessages = (
    messages: MessagePayload[],
    model: string,
    provider: string
  ) => {
    const o1Models = ["o1", "o1-mini", "o1-preview"];

    if (provider === "mistral") {
      // For Mistral, flatten all "text" type content into a single string per message.
      // Extract and concatenate only "text" type content items into a single string.
      // Other content types (like images or documents) are ignored for Mistral since only plain text is supported.
      return messages.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content
              .filter((c) => c.type === "text" && typeof c.text === "string")
              .map((c: any) => c.text)
              .join(" ")
          : m.content, // If already a string, use as is.
      }));
    }

    // For "o1" models, remap "system" role to "user".
    return o1Models.includes(model)
      ? messages.map((m) => ({
          role: m.role === "system" ? "user" : m.role,
          content: m.content,
        }))
      : messages;
  };
}
