import { IronaRouter } from "../src/irona-router";

class IronaAI extends IronaRouter {
  constructor(config: { apiKey: string; baseUrl?: string }) {
    super(config); // Call the parent constructor with config
  }
}

export default IronaAI;
