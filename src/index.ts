import { IronaChatClient } from "./irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "./irona-router-client/IronaRouterClient";
import { Config } from "./types";
import { ModelSelectPayload } from "./validators/modelSelect.validator";
import { CompletionsPayload } from "./validators/completions.validator";
import { MissingApiKeyError } from "./errors";
require("dotenv").config();

// Constants
const DEFAULT_BASE_URL = "https://app.irona.ai";

export class IronaAI {
  private ironaRouter: IronaRouterClient;
  private llmChatService: IronaChatClient;
  constructor(config: Config = {}) {
    const apiKey = process.env.IRONAAI_API_KEY;
    if (!apiKey) {
      throw new MissingApiKeyError(
        "The IRONAAI_API_KEY environment variable is missing or empty. Please ensure that the IRONAAI_API_KEY is set in the environment variables."
      );
    }
    config.baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    this.ironaRouter = new IronaRouterClient(config);
    this.llmChatService = new IronaChatClient(this.ironaRouter);
  }
  private modelSelect(body: ModelSelectPayload): Promise<any> {
    return this.ironaRouter.modelSelect(body);
  }

  private completions = {
    create: (body: CompletionsPayload): Promise<any> => {
      return this.llmChatService.completions(body);
    },
  };
}
