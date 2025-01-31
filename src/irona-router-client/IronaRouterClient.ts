import { Base } from "./base";
import { validateSchema } from "../utils/requestValidator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../validators/modelSelect.validator";
import { Config } from "../types";
import { MissingApiKeyError, BadRequestError } from "../errors";
import { validateAndGetProviderAndModel } from "../utils/validateAndGetProviderAndModel";
const resources = "";
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
      let result = await this.request<{
        fallback_providers: { provider: string; model: string }[];
        error: any;
        sucess: boolean;
        message: String;
        statusCode: number;
      }>(`${resources}`, {
        method: "POST",
        data: formattedPayload,
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
      });
      // Default fallback_providers
      let fallback_providers: { provider: string; model: string }[] = [
        { provider: "openai", model: "gpt-4o-mini" },
        { provider: "anthropic", model: "claude-3-haiku-20240307" },
      ];
      // Use fallback_providers if they are provided in the request
      if (body.fallback_models && body.fallback_models.length > 0) {
        fallback_providers = body.fallback_models.map((modelPayload) => {
          const [provider, ...modelParts] = modelPayload
            .toLowerCase()
            .split("/");
          const model = modelParts.join("/");
          return { provider, model };
        });
      }
      if (result && result.error) {
        result.fallback_providers = fallback_providers;
      }
      return result;
    } catch (error) {
      throw error;
    }
  }
}
