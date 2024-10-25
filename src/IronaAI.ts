import { IronaRouter } from "./irona-router/IronaRouter";
import { Config } from "./types";
require("dotenv").config();

export class IronaAI {
  private ironaRouter: IronaRouter;
  constructor(config: Config) {
    config.baseUrl = config.baseUrl || process.env.BASE_URL;
    this.ironaRouter = new IronaRouter(config);
    // this.llmService = new LLMService(apiKey);
  }
  modelSelect(body: any): Promise<any> {
    return this.ironaRouter.modelSelect(body);
  }
}

export default IronaAI;
