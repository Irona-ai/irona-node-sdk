import { IronaChatClient } from "./irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "./irona-router-client/IronaRouterClient";
import { Config } from "./types";
import { ModelSelectPayload } from "./validators/modelSelect.validator";
import { CompletionsPayload } from "./validators/completions.validator";
import { MissingApiKeyError } from "./errors";
require("dotenv").config();

// Constants
const DEFAULT_BASE_URL = "https://irona-ai--model-select.modal.run";
const IRONAAI_API_KEY_PREFIX = "sk_";

export class IronaAI {
  private ironaRouter: IronaRouterClient;
  private llmChatService: IronaChatClient;
  constructor(config: Config = {}) {
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
  public modelSelect(body: ModelSelectPayload): Promise<any> {
    return this.ironaRouter.modelSelect(body);
  }

  public completions = {
    create: (body: CompletionsPayload): Promise<any> => {
      return this.llmChatService.completions(body);
    },
  };
}
