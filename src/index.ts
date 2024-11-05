import { IronaChatClient } from "./irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "./irona-router-client/IronaRouterClient";
import { Config } from "./types";
import { ModelSelectPayload } from "./validators/modelSelect.validator";
import { CompletionsPayload } from "./validators/completions.validator";
require("dotenv").config();

// Constants
const DEFAULT_BASE_URL = 'https://app.irona.ai';

export class IronaAI {
  private ironaRouter: IronaRouterClient;
  private llmChatService: IronaChatClient;
  constructor(config: Config = {}) {
    config.baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    this.ironaRouter = new IronaRouterClient(config);
    this.llmChatService = new IronaChatClient();
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