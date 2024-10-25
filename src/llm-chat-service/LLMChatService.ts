import { ChatModelConfig } from "../types";
import { OpenAIChatModel } from "./OpenAIChatModel";

export class LLMChatService {
  constructor() {}
  async completions(apiKey: string, body: any): Promise<any> {
    const [ provider, model ] = body.model.toLowerCase().split("/");
    const chatModelConfig: ChatModelConfig = {
      apiKey,
      modelName: model,
      temperature: body?.temperature,
    };
    const chatModel = this.getChatModel(provider, chatModelConfig);
    if (!chatModel) {
      throw Error("No chat model found");
    }
    if (body.stream) {
        return await chatModel.stream(body.messages);
    //   const stream =  await chatModel.stream(body.messages);
    //   for await (const chunk of stream) {
    //     console.log(chunk);
    //   }
    } else {
      return await chatModel.invoke(body.messages);
    }
  }
  private getChatModel(provider: string, chatModelConfig: ChatModelConfig) {
    switch (provider) {
      case "openai": // Add any other OpenAI models
        return OpenAIChatModel(chatModelConfig);
      default:
        throw new Error(`No adapter found for provider: ${provider}`);
    }
  }
}
