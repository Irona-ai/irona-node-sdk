import { ChatOpenAI } from "@langchain/openai";
import { ChatModelConfig } from "../types";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export class LLMChatService {
  constructor() {}
  async completions(apiKey: string, body: any): Promise<any> {
    const [provider, model] = body.model.toLowerCase().split("/");
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
      case "google-genai":
        console.log(chatModelConfig.apiKey);
        return new ChatGoogleGenerativeAI(chatModelConfig);
      case "mistralai":
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
