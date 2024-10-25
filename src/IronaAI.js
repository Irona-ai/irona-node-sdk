"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IronaAI = void 0;
const IronaRouter_1 = require("./irona-router/IronaRouter");
const LLMChatService_1 = require("./llm-chat-service/LLMChatService");
require("dotenv").config();
class IronaAI {
    ironaRouter;
    llmChatService;
    constructor(config) {
        config.baseUrl = config.baseUrl || process.env.BASE_URL;
        this.ironaRouter = new IronaRouter_1.IronaRouter(config);
        this.llmChatService = new LLMChatService_1.LLMChatService();
    }
    modelSelect(body) {
        return this.ironaRouter.modelSelect(body);
    }
    completions(apiKey, body) {
        return this.llmChatService.completions(apiKey, body);
    }
}
exports.IronaAI = IronaAI;
exports.default = IronaAI;
