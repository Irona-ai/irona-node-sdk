import { Base } from "./base";
import { validateSchema } from "../utils/requestValidator";
import { modelSelectSchema } from "../validators/modelSelect.validator";
import { Config } from "../types";
import { MissingApiKeyError, BadRequestError } from "../errors";
const resources = "/api/v1/model-router/select-model"; // TODO: will change this to model-select in the irona-web-server repo
export class IronaRouterClient extends Base {
  constructor(config: Config) {
    super(config);
  }
  async modelSelect(body: any): Promise<any> {
    const apiKey = process.env.IRONAAI_API_KEY;
    if (!apiKey) {
      throw new MissingApiKeyError(
        "IRONAAI_API_KEY is not set in the environment variables."
      );
    }
    const validationResult = validateSchema(modelSelectSchema, body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    try {
      const result = await this.request(`${resources}`, {
        method: "POST",
        data: body,
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
      });
      return result;
    } catch (error) {
      throw error;
    }
  }
}
