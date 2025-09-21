// src/index.ts
import { IronaChatClient } from "./irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "./irona-router-client/IronaRouterClient";
import { IronaImageClient } from "./irona-chat-client/IronaImageClient";
import { Config } from "./types";
import { ModelSelectPayload } from "./schemas/modelSelect.schema";
import { CompletionsPayload } from "./schemas/completions.schema";
import { ImageGenerationPayload } from "./schemas/imageGeneration.schema";
import { MissingApiKeyError } from "./errors";
import { updateProvidersFromGist } from "./supported_models";
import {
  IRONAAI_API_KEY_PREFIX,
  DEFAULT_BASE_URL,
  SUPPORTED_MODELS_DEFAULT_URL,
} from "./utils/constants";

require("dotenv").config();

import { UseAiToolsClient, UseAiToolsPayload } from "./UseAiToolsClient";

export class IronaAI {
  private ironaRouter: IronaRouterClient;
  private llmChatService: IronaChatClient;
  private llmImageService: IronaImageClient;
  private useAiToolsService: UseAiToolsClient;

  private constructor(config: Config = {}) {
    const apiKey = config.apiKey || process.env.IRONAAI_API_KEY;
    if (!apiKey) throw new MissingApiKeyError("API key missing");
    if (typeof apiKey !== "string" || !apiKey.startsWith(IRONAAI_API_KEY_PREFIX))
      throw new MissingApiKeyError("Invalid API key");

    config.baseUrl = config.baseUrl || DEFAULT_BASE_URL;

    this.ironaRouter = new IronaRouterClient(config);
    this.llmChatService = new IronaChatClient(config, this.ironaRouter);
    this.llmImageService = new IronaImageClient(config, this.ironaRouter);
    this.useAiToolsService = new UseAiToolsClient();
  }

  public static async createInstance(config: Config = {}): Promise<IronaAI> {
    await this.ensureProvidersLoaded();
    return new IronaAI(config);
  }

  private static async ensureProvidersLoaded(
    retries = 3,
    delay = 1000
  ): Promise<void> {
    const SUPPORTED_MODELS_GIST_URL =
      process.env.SUPPORTED_MODELS_URL ?? SUPPORTED_MODELS_DEFAULT_URL;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await updateProvidersFromGist(SUPPORTED_MODELS_GIST_URL);
        return;
      } catch {
        if (attempt < retries) await new Promise((res) => setTimeout(res, delay));
      }
    }

    throw new Error("Cannot load Supported Models details from Gist");
  }

  // Router methods
  public modelSelect(body: ModelSelectPayload): Promise<any> {
    return this.ironaRouter.modelSelect(body);
  }

  public modelSelectForImageGeneration(body: ImageGenerationPayload): Promise<any> {
    return this.ironaRouter.modelSelectForImageGeneration(body);
  }

  // Completions
  public completions = {
    create: (body: CompletionsPayload): Promise<any> => this.llmChatService.completions(body),
  };

  // Image generation
  public images = {
    generate: (body: ImageGenerationPayload): Promise<any> => this.llmImageService.generateImage(body),
  };

  // Tools integration
  public tools = {
    execute: (payload: UseAiToolsPayload) => this.useAiToolsService.execute(payload),

    // Frontend sends only userId + provider, redirectUri handled internally
    initiateAuth: (provider: string, userId: string) =>
      this.useAiToolsService.initiateAuth(provider, userId),

    // Callback after OAuth, connectionRequestId comes from Composio callback
    handleCallback: (provider: string, connectionRequestId: string, userId: string) =>
      this.useAiToolsService.handleCallback(provider, connectionRequestId, userId),
  };
}
