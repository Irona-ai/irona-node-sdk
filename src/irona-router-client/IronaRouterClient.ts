import { Base } from "./base";
import { validateSchema } from "../utils/requestValidator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../validators/modelSelect.validator";
import { ModelPayload } from "../validators/common.validators";
import { Config } from "../types";
import {
  MissingApiKeyError,
  BadRequestError,
  UnsupportedModelError,
} from "../errors";
import { isSupportedModel } from "../supported_models";
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
        return this.validateAndGetProviderAndModel(model);
      }),
      kwargs: body?.kwargs,
    };

    try {
      const result = await this.request(`${resources}`, {
        method: "POST",
        data: formattedPayload,
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
  private validateAndGetProviderAndModel(modelPayload: ModelPayload) {
    const [provider, ...modelParts] = modelPayload.toLowerCase().split("/");
    const model = modelParts.join("/");
    if (!isSupportedModel(provider, model)) {
      throw new UnsupportedModelError(`${provider}/${model} is not supported.`);
    }
    return { provider, model };
  }
}
