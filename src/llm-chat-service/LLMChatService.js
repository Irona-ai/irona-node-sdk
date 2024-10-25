"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMChatService = void 0;
const OpenAIChatModel_1 = require("./OpenAIChatModel");
class LLMChatService {
    constructor() { }
    async completions(apiKey, body) {
        const [provider, model] = body.model.toLowerCase().split("/");
        const chatModelConfig = {
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
        }
        else {
            return await chatModel.invoke(body.messages);
        }
    }
    getChatModel(provider, chatModelConfig) {
        switch (provider) {
            case "openai": // Add any other OpenAI models
                return (0, OpenAIChatModel_1.OpenAIChatModel)(chatModelConfig);
            default:
                throw new Error(`No adapter found for provider: ${provider}`);
        }
    }
}
exports.LLMChatService = LLMChatService;
