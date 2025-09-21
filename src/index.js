"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IronaAI = void 0;
// src/index.ts
const IronaChatClient_1 = require("./irona-chat-client/IronaChatClient");
const IronaRouterClient_1 = require("./irona-router-client/IronaRouterClient");
const IronaImageClient_1 = require("./irona-chat-client/IronaImageClient");
const errors_1 = require("./errors");
const supported_models_1 = require("./supported_models");
const constants_1 = require("./utils/constants");
require("dotenv").config();
const UseAiToolsClient_1 = require("./UseAiToolsClient");
class IronaAI {
    ironaRouter;
    llmChatService;
    llmImageService;
    useAiToolsService;
    constructor(config = {}) {
        const apiKey = config.apiKey || process.env.IRONAAI_API_KEY;
        if (!apiKey)
            throw new errors_1.MissingApiKeyError("API key missing");
        if (typeof apiKey !== "string" || !apiKey.startsWith(constants_1.IRONAAI_API_KEY_PREFIX))
            throw new errors_1.MissingApiKeyError("Invalid API key");
        config.baseUrl = config.baseUrl || constants_1.DEFAULT_BASE_URL;
        this.ironaRouter = new IronaRouterClient_1.IronaRouterClient(config);
        this.llmChatService = new IronaChatClient_1.IronaChatClient(config, this.ironaRouter);
        this.llmImageService = new IronaImageClient_1.IronaImageClient(config, this.ironaRouter);
        this.useAiToolsService = new UseAiToolsClient_1.UseAiToolsClient();
    }
    static async createInstance(config = {}) {
        await this.ensureProvidersLoaded();
        return new IronaAI(config);
    }
    static async ensureProvidersLoaded(retries = 3, delay = 1000) {
        const SUPPORTED_MODELS_GIST_URL = process.env.SUPPORTED_MODELS_URL ?? constants_1.SUPPORTED_MODELS_DEFAULT_URL;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                await (0, supported_models_1.updateProvidersFromGist)(SUPPORTED_MODELS_GIST_URL);
                return;
            }
            catch {
                if (attempt < retries)
                    await new Promise((res) => setTimeout(res, delay));
            }
        }
        throw new Error("Cannot load Supported Models details from Gist");
    }
    // Router methods
    modelSelect(body) {
        return this.ironaRouter.modelSelect(body);
    }
    modelSelectForImageGeneration(body) {
        return this.ironaRouter.modelSelectForImageGeneration(body);
    }
    // Completions
    completions = {
        create: (body) => this.llmChatService.completions(body),
    };
    // Image generation
    images = {
        generate: (body) => this.llmImageService.generateImage(body),
    };
    // Tools integration
    tools = {
        execute: (payload) => this.useAiToolsService.execute(payload),
        // Frontend sends only userId + provider, redirectUri handled internally
        initiateAuth: (provider, userId) => this.useAiToolsService.initiateAuth(provider, userId),
        // Callback after OAuth, connectionRequestId comes from Composio callback
        handleCallback: (provider, connectionRequestId, userId) => this.useAiToolsService.handleCallback(provider, connectionRequestId, userId),
    };
}
exports.IronaAI = IronaAI;
