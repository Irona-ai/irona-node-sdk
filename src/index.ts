import { IronaChatClient } from "./irona-chat-client/IronaChatClient";
import { IronaImageClient } from "./irona-chat-client/IronaImageClient";
import { IronaRouterClient } from "./irona-router-client/IronaRouterClient";
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

export class IronaAI {
  private ironaRouter: IronaRouterClient;
  private llmChatService: IronaChatClient;
  private imageService: IronaImageClient;
  private constructor(config: Config = {}) {
    // Check for API key
    const apiKey = config.apiKey || process.env.IRONAAI_API_KEY;
    if (!apiKey) {
      throw new MissingApiKeyError(
        "The API key is missing. Please provide the API key either through the 'IRONAAI_API_KEY' environment variable or the 'config.apiKey' property."
      );
    }
    if (
      typeof apiKey !== "string" ||
      !apiKey.startsWith(IRONAAI_API_KEY_PREFIX)
    ) {
      throw new MissingApiKeyError(
        "The provided API key is invalid. Please generate a new key at 'https://app.irona.ai/dashboard/api-keys'."
      );
    }

    config.baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    this.ironaRouter = new IronaRouterClient(config);
    this.llmChatService = new IronaChatClient(config, this.ironaRouter);
    this.imageService = new IronaImageClient(config, this.ironaRouter);
  }

  // Static factory method to handle async initialization
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
      } catch (error) {
        console.warn(
          `Attempt ${attempt} to load Supported Models details failed. Retrying...`
        );
        if (attempt < retries)
          await new Promise((res) => setTimeout(res, delay));
      }
    }

    throw new Error(
      "Cannot instantiate IronaAI as it failed to load Supported Models details from Gist after multiple attempts. Please provide correct value of environment key SUPPORTED_MODELS_URL or leave it undefined."
    );
  }

  public modelSelect(body: ModelSelectPayload): Promise<any> {
    return this.ironaRouter.modelSelect(body);
  }

  public completions = {
    create: (body: CompletionsPayload): Promise<any> => {
      return this.llmChatService.completions(body);
    },
  };
  public images = {
    generate: (body: ImageGenerationPayload): Promise<any> => {
      return this.imageService.generateImage(body);
    },
  };
}
