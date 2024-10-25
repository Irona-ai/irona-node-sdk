import { IronaRouter } from "./irona-router/IronaRouter";
import { LLMChatService } from "./llm-chat-service/LLMChatService";
import { Config } from "./types";
require("dotenv").config();

export class IronaAI {
  private ironaRouter: IronaRouter;
  private llmChatService: LLMChatService;
  constructor(config: Config) {
    config.baseUrl = config.baseUrl || process.env.BASE_URL;
    this.ironaRouter = new IronaRouter(config);
    this.llmChatService = new LLMChatService();
    
  }
  modelSelect(body: any): Promise<any> {
    return this.ironaRouter.modelSelect(body);
  }
  completions(apiKey: string, body: any): Promise<any> {
    return this.llmChatService.completions(apiKey,body);
  }
}

export default IronaAI;
