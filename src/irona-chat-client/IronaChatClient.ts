import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { perplexity } from "@ai-sdk/perplexity";
import { togetherai } from '@ai-sdk/togetherai';
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
import { MessagePayload } from "../schemas/common.schema";
import { z } from 'zod';
import { Message } from 'ai';
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
      const messages = this.formatInputMessages(payload.messages, model, provider);

      // Get the appropriate model instance
      const modelInstance = this.getModelInstance(provider, model, apiKey);
      if (!modelInstance) {
        throw new Error(`No model instance found for provider: ${provider}`);
      }

      // Convert messages to Vercel AI SDK format
      const vercelMessages = this.convertToVercelMessages(messages);

      // Handle function calling if functions are provided
      if (payload.functions) {
        return this.handleFunctionCalling(modelInstance, vercelMessages, payload);
      }

      // Handle structured output if schema is provided
      if (payload.outputSchema) {
        return this.handleStructuredOutput(modelInstance, vercelMessages, payload);
      }

      // Regular completion
      if (payload.stream) {
        const stream = await streamText({
          model: modelInstance,
          messages: vercelMessages,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
        });

        return {
          response: stream,
          provider,
          model,
        };
      } else {
        const response = await generateText({
          model: modelInstance,
          messages: vercelMessages,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
        });

        return {
          response: {
            content: { text: response.text },
            role: 'assistant'
          },
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

  /**
   * Converts messages to Vercel AI SDK format
   */
  private convertToVercelMessages(messages: MessagePayload[]): Message[] {
    return messages.map((msg, index) => ({
      id: `msg-${index}`,
      role: msg.role,
      content: typeof msg.content === 'string' 
        ? msg.content 
        : msg.content.map(content => {
            if (content.type === 'text') return content.text;
            if (content.type === 'image_url') return content.image_url.url;
            if (content.type === 'document') return content.source.url;
            return '';
          }).join(' ')
    }));
  }

  /**
   * Handles function calling with Vercel AI SDK
   */
  private async handleFunctionCalling(
    modelInstance: any,
    messages: Message[],
    payload: CompletionsPayload
  ) {
    const response = await generateText({
      model: modelInstance,
      messages,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
      tools: payload.functions?.reduce((acc, func) => ({
        ...acc,
        [func.name]: {
          type: 'function',
          function: {
            name: func.name,
            description: func.description,
            parameters: func.parameters
          }
        }
      }), {})
    });

    return {
      response: {
        content: { text: response.text },
        role: 'assistant'
      }
    };
  }

  /**
   * Handles structured output with Vercel AI SDK
   */
  private async handleStructuredOutput(
    modelInstance: any,
    messages: Message[],
    payload: CompletionsPayload
  ) {
    const response = await generateText({
      model: modelInstance,
      messages: [
        ...messages,
        { role: 'system', content: 'You must respond with valid JSON that matches the provided schema.' }
      ],
      temperature: payload.temperature,
      maxTokens: payload.maxTokens
    });

    try {
      const parsed = z.object(payload.outputSchema || {}).parse(
        JSON.parse(response.text)
      );
      return {
        response: {
          content: parsed,
          role: 'assistant'
        }
      };
    } catch (error) {
      console.error('Failed to parse structured output:', error);
      return {
        response: {
          content: { text: response.text },
          role: 'assistant'
        }
      };
    }
  }

  /**
   * Gets the appropriate model instance
   */
  private getModelInstance(provider: string, model: string, apiKey: string) {
    const config = {
      apiKey,
      modelName: model,
    };

    // Map of provider to their respective model functions
    const providerModels = {
      openai: openai,
      anthropic: anthropic,
      google: google,
      mistral: mistral,
      perplexity: perplexity,
      togetherai: togetherai,
    };

    const modelFunction = providerModels[provider as keyof typeof providerModels];
    if (!modelFunction) {
      return null;
    }

    return modelFunction(model);
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
    // Get the model instance using the shared getModelInstance function
    const modelInstance = this.getModelInstance(provider, chatModelConfig.modelName, chatModelConfig.apiKey);
    if (!modelInstance) {
      throw new Error(`No chat model found for provider: ${provider}`);
    }

    return {
      // 'invoke' method for non-streaming completions
      invoke: async (messages: any[]) => {
        const response = await generateText({
          model: modelInstance,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          temperature: chatModelConfig.temperature,
          maxTokens: chatModelConfig.maxTokens
        });
        return {
          content: response,
          role: 'assistant'
        };
      },
      // 'stream' method for streaming completions
      stream: async (messages: any[]) => {
        const { textStream } = await streamText({
          model: modelInstance,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          temperature: chatModelConfig.temperature,
          maxTokens: chatModelConfig.maxTokens
        });
        return textStream;
      }
    };
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
