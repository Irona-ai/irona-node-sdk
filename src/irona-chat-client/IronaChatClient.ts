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
} from "../validators/completions.validator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../validators/modelSelect.validator";
import { IronaRouterClient } from "../irona-router-client/IronaRouterClient";
import { validateAndGetProviderAndModel } from "../utils/validateAndGetProviderAndModel";
import { ChatPerplexity } from "../custom-chat-models/perplexity";
import { MessagePayload } from "@/validators/common.validators";
import { Base } from "@/irona-router-client/base";

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
      { provider, model },
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
        return response; // Return on first success
      } catch (error) {
        console.error(error);
        // TODO: Fix Logging of Error Details
        // console.error(`Error: ${JSON.stringify(error,null,2)}`);
      }
    }
    // If all retries fail, throw an error
    throw new Error(
      `All attempts to process the completions request failed. Please verify the providers and models in your configuration.`
    );
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

      const chatModel = this.getChatModel(provider, chatModelConfig);
      if (!chatModel) {
        throw new Error(
          `No chat model instance found for provider: ${provider}`
        );
      }

      const messages = this.formatInputMessages(payload.messages, model);

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
    if (body.models.length != 1) {
      const response = await this.ironaRouter.modelSelect(
        this.extractModelSelectPayloadFromCompletionsPayload(body)
      );
      const providers =
        response && response.error
          ? response.fallback_providers
          : response.providers;

      return providers[0];
    } else {
      return validateAndGetProviderAndModel(body.models[0]);
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

  /**
   * Formats messages for "o1" models by remapping the "system" role to "user".
   * This is a workaround to handle limitations in "o1" models ("o1", "o1-mini", "o1-preview") that do not support the "system" role directly.
   * @param {MessagePayload[]} messages - List of input messages containing role and content.
   * @param {string} model - Target model name. If the model belongs to the "o1" family, roles are remapped.
   * @returns {MessagePayload[]} - Messages with "system" roles remapped to "user" for "o1" models.
   */
  private formatInputMessages = (messages: MessagePayload[], model: string) => {
    const o1Models = ["o1", "o1-mini", "o1-preview"];

    return o1Models.includes(model)
      ? messages.map((m) => ({
          role: m.role === "system" ? "user" : m.role,
          content: m.content,
        }))
      : messages;
  };
}
