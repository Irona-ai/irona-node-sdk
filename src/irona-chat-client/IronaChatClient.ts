import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { perplexity } from "@ai-sdk/perplexity";
import { togetherai } from "@ai-sdk/togetherai";
import { Config } from "../types";
import { MissingApiKeyError } from "../errors";
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

      // Convert messages to Vercel AI SDK format
      const vercelMessages = this.convertToVercelMessages(payload.messages);

      // Get the appropriate model instance
      const modelInstance = this.getModelInstance(provider,model);
      if (!modelInstance) {
        throw new Error(`No model instance found for provider: ${provider}`);
      }

      // Regular completion
      if (payload.stream) {
        const stream = await streamText({
          model: modelInstance(model),
          messages: vercelMessages,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
        });

        const fullStream = stream.fullStream; // this is the method that gives you streamable parts

        return {
          response: {
            fullStream,
          },
          provider,
          model,
        };
      } else {
        const response = await generateText({
          model: modelInstance(model),
          messages: vercelMessages,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
        });

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
        }`
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
            mimeType: "application/pdf"
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
  private getModelInstance(provider: string, model: string) {
    // Map of provider to their respective model functions
    const providerModels = {
      openai: openai,
      anthropic: anthropic,
      google: google,
      mistral: mistral,
      perplexity: perplexity,
      togetherai: togetherai,
    };
// Add logic for search grounding or web search
    if (provider === "google" && model.startsWith("gemini-")) {
      // Enable search grounding for Gemini models that support it
      return (modelName: string) => providerModels[provider](modelName, { useSearchGrounding: true });
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
}