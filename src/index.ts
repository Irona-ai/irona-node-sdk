import { IronaChatClient } from "./irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "./irona-router-client/IronaRouterClient";
import { Config } from "./types";
import { ModelSelectPayload } from "./validators/modelSelect.validator";
import { CompletionsPayload } from "./validators/completions.validator";
import { MissingApiKeyError } from "./errors";
import { updateProvidersFromGist } from "./supported_models";
require("dotenv").config();

// Constants
const DEFAULT_BASE_URL = "https://irona-ai--model-select.modal.run";
const IRONAAI_API_KEY_PREFIX = "sk_";

export class IronaAI {
  private ironaRouter: IronaRouterClient;
  private llmChatService: IronaChatClient;
  private constructor(config: Config = {}) {
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
  }
  // Static factory method to handle async initialization
  public static async createInstance(config: Config = {}): Promise<IronaAI> {
    await this.ensureProvidersLoaded();
    return new IronaAI(config);
  }

  private static async ensureProvidersLoaded(
    retries = 3,
    delay = 2000
  ): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await updateProvidersFromGist();
        return;
      } catch (error) {
        console.warn(
          `Attempt ${attempt} to load providers failed. Retrying...`
        );
        if (attempt < retries)
          await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new Error(
      "Failed to load providers from Gist after multiple attempts."
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
}
