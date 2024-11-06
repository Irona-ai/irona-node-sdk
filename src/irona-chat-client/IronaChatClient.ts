import { ChatOpenAI } from "@langchain/openai";
import { ChatModelConfig } from "../types";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  MissingApiKeyError,
  UnsupportedModelError,
  BadRequestError,
} from "../errors";
import { isSupportedModel, providerApiKeyName } from "../supported_models";
import { validateSchema } from "../utils/requestValidator";
import { CompletionsPayload, completionsSchema } from "../validators/completions.validator";

export class IronaChatClient {
  constructor() {}
  async completions(body: CompletionsPayload) {
    // validate input
    const validationResult = validateSchema(completionsSchema, body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }
    const [provider, ...modelParts] = body.model.toLowerCase().split("/");
    const model = modelParts.join("/");
    if (!isSupportedModel(provider, model)) {
      throw new UnsupportedModelError(`${provider}/${model} is not supported.`);
    }
    const apiKeyName = providerApiKeyName(provider);
    const apiKey = process.env[apiKeyName];
    if (!apiKey) {
      throw new MissingApiKeyError(
        `The environment variable ${apiKeyName} is missing or empty. Please ensure that ${apiKeyName} is set in the environment variables for the ${provider}/${model} model.`
      );
    }
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
