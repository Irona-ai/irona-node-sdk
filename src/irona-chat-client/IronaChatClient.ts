import { ChatOpenAI } from "@langchain/openai";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatModelConfig } from "../types";
import {
  MissingApiKeyError,
  BadRequestError,
  UnsupportedModelError,
} from "../errors";
import { providerApiKeyName, isSupportedModel } from "../supported_models";
import { validateSchema } from "../utils/requestValidator";
import {
  CompletionsPayload,
  CompletionsSchema,
} from "../validators/completions.validator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../validators/modelSelect.validator";
import { ModelPayload } from "../validators/common.validators";
import { IronaRouterClient } from "../irona-router-client/IronaRouterClient";

export class IronaChatClient {
  constructor(private readonly ironaRouter: IronaRouterClient) {}

  async completions(body: CompletionsPayload) {
    // validate input
    const validationResult = validateSchema(CompletionsSchema, body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    const { provider, model } = await this.selectBestModel(body);
    const apiKey = this.loadApiKeyForProvider(provider, model);

    const chatModelConfig: ChatModelConfig = {
      apiKey,
      modelName: model,
      temperature: body?.temperature,
      maxRetries: body?.maxRetries,
      maxTokens: body?.maxTokens,
    };

    const chatModel = this.getChatModel(provider, chatModelConfig);
    if (!chatModel) {
      throw Error("No chat model found");
    }
    if (body.stream) {
      return await chatModel.stream(body.messages);
    } else {
      return await chatModel.invoke(body.messages);
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
  private validateAndGetProviderAndModel(modelPayload: ModelPayload) {
    const [provider, ...modelParts] = modelPayload.toLowerCase().split("/");
    const model = modelParts.join("/");
    if (!isSupportedModel(provider, model)) {
      throw new UnsupportedModelError(`${provider}/${model} is not supported.`);
    }
    return { provider, model };
  }
  private async selectBestModel(body: CompletionsPayload) {
    if (body.models.length != 1) {
      const response = await this.ironaRouter.modelSelect(
        this.extractModelSelectPayloadFromCompletionsPayload(body)
      );
      const providers = response.data.providers;
      return providers[0];
    } else {
      return this.validateAndGetProviderAndModel(body.models[0]);
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
        console.log("Anthropic API Key:", chatModelConfig.apiKey);
        return new ChatAnthropic(chatModelConfig);
      case "google":
        console.log(chatModelConfig.apiKey);
        return new ChatGoogleGenerativeAI(chatModelConfig);
      case "mistral":
        return new ChatMistralAI(chatModelConfig);
      case "openai":
        return new ChatOpenAI(chatModelConfig);
      case "togetherai":
        return new ChatTogetherAI(chatModelConfig);
      default:
        throw new Error(`No chat model found for provider: ${provider}`);
    }
  }
}
