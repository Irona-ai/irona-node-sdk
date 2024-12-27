import { Base } from "./base";
import { validateSchema } from "../utils/requestValidator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../validators/modelSelect.validator";
import { Config } from "../types";
import {
  MissingApiKeyError,
  BadRequestError,
} from "../errors";
import { validateAndGetProviderAndModel } from "../utils/validateAndGetProviderAndModel";
const resources = "/api/v1/model-router/model-select";
export class IronaRouterClient extends Base {
  constructor(config: Config) {
    super(config);
  }

  async modelSelect(body: ModelSelectPayload): Promise<any> {
    const apiKey = process.env.IRONAAI_API_KEY;
    if (!apiKey) {
      throw new MissingApiKeyError(
        "The IRONAAI_API_KEY environment variable is missing or empty. Please ensure that the IRONAAI_API_KEY is set in the environment variables."
      );
    }
    const validationResult = validateSchema(ModelSelectSchema, body);

    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    const formattedPayload = {
      topk_models: body?.topk_models,
      messages: body.messages,
      llm_providers: body.models.map((model) => {
        return validateAndGetProviderAndModel(model);
      }),
      kwargs: body?.kwargs,
    };

    try {
      let result = await this.request<{sucess: boolean, message: String, data: any, statusCode: number}>(`${resources}`, {
        method: "POST",
        data: formattedPayload,
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
      });
      if(result && result.data.error){
      result.data.fallback_models = [ {"provider": "openai", "model": "gpt-4o-mini"}, {"provider": "anthropic", "model": "claude-3-haiku-20240307"}]
      }
      return result;
    } catch (error) {
      throw error;
    }
  }
}
