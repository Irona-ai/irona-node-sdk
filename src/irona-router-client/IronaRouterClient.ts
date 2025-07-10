import { Base } from "./base";
import { validateSchema } from "../utils/requestValidator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../schemas/modelSelect.schema";
import { Config } from "../types";
import { MissingApiKeyError, BadRequestError } from "../errors";
import { SUPPORTED_MODELS_DEFAULT_URL } from "../utils/constants";
import { doesModelSupportMediaTypes } from "../supported_models";
import {
  extractMediaTypeArrayFromMessages,
  getSupportedProviderAndModelArray,
} from "../utils/providerAndModelUtils";

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

    const mediaInputsArray = extractMediaTypeArrayFromMessages(body.messages);
    const supportedProviderAndModelArray = getSupportedProviderAndModelArray(
      body.models
    );
    const mediaSupportedProviderAndModelArray =
      supportedProviderAndModelArray.filter(({ provider, model }) =>
        doesModelSupportMediaTypes(provider, model, mediaInputsArray)
      );

    if (mediaSupportedProviderAndModelArray.length === 0) {
      throw new BadRequestError(
        `No valid providers found that support the media types ${mediaInputsArray.join(
          ", "
        )}. Please ensure that the models are correctly formatted and support the required media types. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }
    const formattedPayload = {
      topk_models: body?.topk_models,
      messages: body.messages,
      llm_providers: mediaSupportedProviderAndModelArray,
      kwargs: body?.kwargs,
    };

    // Check if we have any valid providers after filtering
    if (formattedPayload.llm_providers.length === 0) {
      throw new BadRequestError(
        `No valid providers found in the request. Please ensure that the models are correctly formatted. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
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
      throw error;
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
