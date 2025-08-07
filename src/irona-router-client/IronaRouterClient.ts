import { Base } from "./base";
import { validateSchema } from "../utils/requestValidator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../schemas/modelSelect.schema";
import { ImageGenerationPayload, ImageGenerationSchema } from "../schemas/imageGeneration.schema";
import { Config } from "../types";
import { MissingApiKeyError, BadRequestError } from "../errors";
import { SUPPORTED_MODELS_DEFAULT_URL } from "../utils/constants";
import { doesModelSupportMediaTypes,doesModelSupportWebSearch,doesModelSupportImageGeneration } from "../supported_models";
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
    // Filter models based on media support
    const mediaSupportedProviderAndModelArray =
      supportedProviderAndModelArray.filter(({ provider, model }) =>
        doesModelSupportMediaTypes(provider, model, mediaInputsArray)
      );

    if (mediaInputsArray.length > 0 && mediaSupportedProviderAndModelArray.length === 0) {
      throw new BadRequestError(
        `No valid providers found that support the media types ${mediaInputsArray.join(
          ", "
        )}. Please ensure that the models are correctly formatted and support the required media types. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }
    // Filter models based on web search support
    const webSearchSupportedProviderAndModelArray =
      supportedProviderAndModelArray.filter(({ provider, model }) =>
        doesModelSupportWebSearch(provider, model)
      );
      
    if (body.search && webSearchSupportedProviderAndModelArray.length === 0) {
      throw new BadRequestError(
        `No valid providers found that support web search. Please ensure that the models are correctly formatted and support the required capabilities. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }     
    
    // Determine final provider and model array based on requirements (CHAT ONLY)
    let finalProviderAndModelArray;
    if (body.search) {
      finalProviderAndModelArray = webSearchSupportedProviderAndModelArray;
    } else if (mediaInputsArray.length > 0) {
      finalProviderAndModelArray = mediaSupportedProviderAndModelArray;
    } else {
      // No search, no media: allow all models as "normal" text models
      finalProviderAndModelArray = supportedProviderAndModelArray;
    }

    const formattedPayload = {
      topk_models: body?.topk_models,
      messages: body.messages, // Chat requests use messages
      llm_providers: finalProviderAndModelArray,
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

      // If the API returned an error, check if it's a model recognition error
      if (result && result.error) {
        result.fallback_providers = this.getFallbackProviders(body);
        return result;
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  // Separate method for image generation model selection
  async modelSelectForImageGeneration(body: ImageGenerationPayload): Promise<any> {
    const apiKey = process.env.IRONAAI_API_KEY;
    if (!apiKey) {
      throw new MissingApiKeyError(
        "The IRONAAI_API_KEY environment variable is missing or empty. Please ensure that the IRONAAI_API_KEY is set in the environment variables."
      );
    }
    
    const validationResult = validateSchema(ImageGenerationSchema, body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    const supportedProviderAndModelArray = getSupportedProviderAndModelArray(body.models);
    console.log(`[IronaRouterClient][modelSelectForImageGeneration] All models:`, supportedProviderAndModelArray);
    
    // Filter models to only include those that support image generation
    const imageGenerationSupportedProviderAndModelArray =
      supportedProviderAndModelArray.filter(({ provider, model }) =>
        doesModelSupportImageGeneration(provider, model)
      );

    console.log(`[IronaRouterClient][modelSelectForImageGeneration] Image generation supported models:`, imageGenerationSupportedProviderAndModelArray);
    if (imageGenerationSupportedProviderAndModelArray.length === 0) {
      throw new BadRequestError(
        `No valid providers found that support image generation. Currently only OpenAI models are supported for image generation. Please ensure you are using OpenAI models like 'openai/dall-e-3' or 'openai/dall-e-2'. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }

    // DUMMY RANDOM SELECTION - No API call, use random selection
    console.log("[IronaRouterClient][modelSelectForImageGeneration] Using dummy random selection (no external API call)");
    
    // Random selection logic with topk_models
    const topk_models = body?.topk_models || 1;
    const selectedModels = this.getRandomModels(imageGenerationSupportedProviderAndModelArray, topk_models);
    
    console.log(`[IronaRouterClient][modelSelectForImageGeneration] Randomly selected ${selectedModels.length} model(s) from ${imageGenerationSupportedProviderAndModelArray.length} available:`);
    selectedModels.forEach((model, index) => {
      console.log(`[IronaRouterClient][modelSelectForImageGeneration]   ${index + 1}. ${model.provider}/${model.model}`);
    });
    
    return {
      "providers": selectedModels,
      "success": true,
      "message": "Dummy model selection - random models selected",
      "statusCode": 200
    };
  }

  // Helper method for random model selection
  private getRandomModels(models: { provider: string; model: string }[], count: number): { provider: string; model: string }[] {
    // Fisher-Yates shuffle algorithm for better randomization
    const shuffled = [...models];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(count, models.length));
  }

  // Helper method to get fallback providers either from the request or defaults
  private getFallbackProviders(body: ModelSelectPayload | ImageGenerationPayload) {
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
