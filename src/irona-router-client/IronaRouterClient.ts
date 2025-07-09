import { Base } from "./base";
import { validateSchema } from "../utils/requestValidator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../schemas/modelSelect.schema";
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
      return {
        error: "The IRONAAI_API_KEY environment variable is missing or empty. Please ensure that the IRONAAI_API_KEY is set in the environment variables.",
        fallback_providers: this.getFallbackProviders(body),
      };
    }

    const validationResult = validateSchema(ModelSelectSchema, body);
    if (!validationResult.success) {
      return {
        error: validationResult.errors,
        fallback_providers: this.getFallbackProviders(body),
      };
    }

    const formattedPayload = {
      topk_models: body?.topk_models,
      messages: body.messages,
      llm_providers: body.models.map((model) => {
        try {
          return validateAndGetProviderAndModel(model);
        } catch (error) {
          // If validation fails for some models, still continue with valid ones
          console.error(`Error validating model ${model}: ${(error as Error).message}`);
          return null;
        }
      }).filter(provider => provider !== null), // Filter out null providers
      kwargs: body?.kwargs,
    };

    // Check if we have any valid providers after filtering
    if (formattedPayload.llm_providers.length === 0) {
      return {
        error: "No valid LLM providers found after validation",
        fallback_providers: this.getFallbackProviders(body),
      };
    }
    if (formattedPayload.llm_providers.length === 1){
      return {
          "providers":[formattedPayload.llm_providers[0]]
      }
    }
    
    try {
      const result = await this.request<{
        providers: { provider: string; model: string }[];
        fallback_providers: { provider: string; model: string }[];
        error: any;
        success: boolean;
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

      // If the API returned an error, add fallback providers
      if (result && result.error) {
        result.fallback_providers = this.getFallbackProviders(body);
        return result;
      }

      return result;
    } catch (error) {
      return {
        error: (error instanceof Error) ? error.message : "Unknown error occurred during model selection",
        fallback_providers: this.getFallbackProviders(body),
      };
    }
  }

  // Helper method to get fallback providers either from the request or defaults
  private getFallbackProviders(body: ModelSelectPayload) {
    // Default fallback_providers
    let fallback_providers: { provider: string; model: string }[] = [
      { provider: "openai", model: "gpt-4o-mini" },
      { provider: "anthropic", model: "claude-3-haiku-20240307" },
    ];

    // Use fallback_providers if they are provided in the request
    if (body.fallback_models && body.fallback_models.length > 0) {
      try {
        fallback_providers = body.fallback_models.map((modelPayload) => {
          const [provider, ...modelParts] = modelPayload.split("/");
          const model = modelParts.join("/");
          return { provider, model };
        });
      } catch (error) {
        console.error("Error parsing fallback models:", error);
        // Keep the default fallback providers if there's an error
      }
    }

    return fallback_providers;
  }
}
