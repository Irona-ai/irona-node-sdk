"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IronaRouterClient = void 0;
const base_1 = require("./base");
const requestValidator_1 = require("../utils/requestValidator");
const modelSelect_schema_1 = require("../schemas/modelSelect.schema");
const imageGeneration_schema_1 = require("../schemas/imageGeneration.schema");
const errors_1 = require("../errors");
const constants_1 = require("../utils/constants");
const supported_models_1 = require("../supported_models");
const providerAndModelUtils_1 = require("../utils/providerAndModelUtils");
const resources = "";
class IronaRouterClient extends base_1.Base {
    constructor(config) {
        super(config);
    }
    async modelSelect(body) {
        const apiKey = process.env.IRONAAI_API_KEY;
        if (!apiKey) {
            throw new errors_1.MissingApiKeyError("The IRONAAI_API_KEY environment variable is missing or empty. Please ensure that the IRONAAI_API_KEY is set in the environment variables.");
        }
        const validationResult = (0, requestValidator_1.validateSchema)(modelSelect_schema_1.ModelSelectSchema, body);
        if (!validationResult.success) {
            throw new errors_1.BadRequestError(validationResult.errors);
        }
        const mediaInputsArray = (0, providerAndModelUtils_1.extractMediaTypeArrayFromMessages)(body.messages);
        const supportedProviderAndModelArray = (0, providerAndModelUtils_1.getSupportedProviderAndModelArray)(body.models);
        // Filter models based on media support
        const mediaSupportedProviderAndModelArray = supportedProviderAndModelArray.filter(({ provider, model }) => (0, supported_models_1.doesModelSupportMediaTypes)(provider, model, mediaInputsArray));
        if (mediaInputsArray.length > 0 && mediaSupportedProviderAndModelArray.length === 0) {
            throw new errors_1.BadRequestError(`No valid providers found that support the media types ${mediaInputsArray.join(", ")}. Please ensure that the models are correctly formatted and support the required media types. You can visit ${constants_1.SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`);
        }
        // Filter models based on web search support
        const webSearchSupportedProviderAndModelArray = supportedProviderAndModelArray.filter(({ provider, model }) => (0, supported_models_1.doesModelSupportWebSearch)(provider, model));
        if (body.search && webSearchSupportedProviderAndModelArray.length === 0) {
            throw new errors_1.BadRequestError(`No valid providers found that support web search. Please ensure that the models are correctly formatted and support the required capabilities. You can visit ${constants_1.SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`);
        }
        // Determine final provider and model array based on requirements (CHAT ONLY)
        let finalProviderAndModelArray;
        if (body.search) {
            finalProviderAndModelArray = webSearchSupportedProviderAndModelArray;
        }
        else if (mediaInputsArray.length > 0) {
            finalProviderAndModelArray = mediaSupportedProviderAndModelArray;
        }
        else {
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
            throw new errors_1.BadRequestError(`No valid providers found in the request. Please ensure that the models are correctly formatted. You can visit ${constants_1.SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`);
        }
        try {
            const result = await this.request(`${resources}`, {
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
        }
        catch (error) {
            throw error;
        }
    }
    // Separate method for image generation model selection
    async modelSelectForImageGeneration(body) {
        const apiKey = process.env.IRONAAI_API_KEY;
        if (!apiKey) {
            throw new errors_1.MissingApiKeyError("The IRONAAI_API_KEY environment variable is missing or empty. Please ensure that the IRONAAI_API_KEY is set in the environment variables.");
        }
        const validationResult = (0, requestValidator_1.validateSchema)(imageGeneration_schema_1.ImageGenerationSchema, body);
        if (!validationResult.success) {
            throw new errors_1.BadRequestError(validationResult.errors);
        }
        const supportedProviderAndModelArray = (0, providerAndModelUtils_1.getSupportedProviderAndModelArray)(body.models);
        console.log(`[IronaRouterClient][modelSelectForImageGeneration] All models:`, supportedProviderAndModelArray);
        // Filter models to only include those that support image generation
        const imageGenerationSupportedProviderAndModelArray = supportedProviderAndModelArray.filter(({ provider, model }) => (0, supported_models_1.doesModelSupportImageGeneration)(provider, model));
        console.log(`[IronaRouterClient][modelSelectForImageGeneration] Image generation supported models:`, imageGenerationSupportedProviderAndModelArray);
        if (imageGenerationSupportedProviderAndModelArray.length === 0) {
            throw new errors_1.BadRequestError(`No valid providers found that support image generation. Currently only OpenAI models are supported for image generation. Please ensure you are using OpenAI models like 'openai/dall-e-3' or 'openai/dall-e-2'. You can visit ${constants_1.SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`);
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
    getRandomModels(models, count) {
        // Fisher-Yates shuffle algorithm for better randomization
        const shuffled = [...models];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, Math.min(count, models.length));
    }
    // Helper method to get fallback providers either from the request or defaults
    getFallbackProviders(body) {
        // Default fallback_providers
        let fallback_providers = [
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
            }
            catch (error) {
                console.error("Error parsing fallback models:", error);
                // Keep the default fallback providers if there's an error
            }
        }
        return fallback_providers;
    }
}
exports.IronaRouterClient = IronaRouterClient;
