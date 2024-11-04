import { IronaChatClient } from "./irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "./irona-router-client/IronaRouterClient";
import { Config } from "./types";
require("dotenv").config();

// Constants
const DEFAULT_API_URL = "https://api.ironaai.com";

export class IronaAI {
  private ironaRouter: IronaRouterClient;
  private llmChatService: IronaChatClient;
  constructor(config: Config = {}) {
    config.baseUrl = config?.baseUrl || process.env.BASE_URL;
    this.ironaRouter = new IronaRouterClient(config);
    this.llmChatService = new IronaChatClient();
  }
  private modelSelect(body: any): Promise<any> {
    return this.ironaRouter.modelSelect(body);
  }

  private completions = {
    create: (body: any): Promise<any> => {
      return this.llmChatService.completions(body);
    },
  };
}

export default IronaAI;
