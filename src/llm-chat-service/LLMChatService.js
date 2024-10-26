"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMChatService = void 0;
const openai_1 = require("@langchain/openai");
const togetherai_1 = require("@langchain/community/chat_models/togetherai");
const anthropic_1 = require("@langchain/anthropic");
const mistralai_1 = require("@langchain/mistralai");
const google_genai_1 = require("@langchain/google-genai");
class LLMChatService {
    constructor() { }
    async completions(apiKey, body) {
        const [provider, model] = body.model.toLowerCase().split("/");
        const chatModelConfig = {
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
        }
        else {
            return await chatModel.invoke(body.messages);
        }
    }
    getChatModel(provider, chatModelConfig) {
        switch (provider) {
            case "anthropic":
                console.log("Anthropic API Key:", chatModelConfig.apiKey);
                return new anthropic_1.ChatAnthropic(chatModelConfig);
            case "google-genai":
                console.log(chatModelConfig.apiKey);
                return new google_genai_1.ChatGoogleGenerativeAI(chatModelConfig);
            case "mistralai":
                return new mistralai_1.ChatMistralAI(chatModelConfig);
            case "openai":
                return new openai_1.ChatOpenAI(chatModelConfig);
            case "togetherai":
                return new togetherai_1.ChatTogetherAI(chatModelConfig);
            default:
                throw new Error(`No chat model found for provider: ${provider}`);
        }
    }
}
exports.LLMChatService = LLMChatService;
