"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IronaImageClient = void 0;
const ai_1 = require("ai");
const openai_1 = require("@ai-sdk/openai");
const google_vertex_1 = require("@ai-sdk/google-vertex"); // Add Vertex AI support
const errors_1 = require("../errors");
const supported_models_1 = require("../supported_models");
const requestValidator_1 = require("../utils/requestValidator");
const imageGeneration_schema_1 = require("../schemas/imageGeneration.schema");
const providerAndModelUtils_1 = require("../utils/providerAndModelUtils");
const constants_1 = require("../utils/constants");
const IronaChatClient_1 = require("./IronaChatClient");
class IronaImageClient extends IronaChatClient_1.IronaChatClient {
    /**
     * Generates images based on the provided prompt and configuration
     */
    async generateImage(payload) {
        // Validate input schema
        const validationResult = (0, requestValidator_1.validateSchema)(imageGeneration_schema_1.ImageGenerationSchema, payload);
        if (!validationResult.success) {
            throw new errors_1.BadRequestError(validationResult.errors);
        }
        // Use prompt directly - no need to extract from messages
        const prompt = payload.prompt;
        if (!prompt) {
            throw new errors_1.BadRequestError("Image generation requires a prompt");
        }
        // Select the best model using proper criteria
        const { provider, model } = await this.selectBestImageGenerationModel(payload);
        // Prepare the model priority queue for image generation
        // If `fallback_models` is provided in the payload, they will take precedence over `config.fallback_models`
        const modelPriorityQueue = [
            ...(provider && model ? [{ provider, model }] : []),
            ...(payload.fallback_models ?? this.config.fallback_models ?? []).map((fallback) => (0, providerAndModelUtils_1.validateAndGetProviderAndModel)(fallback)),
        ];
        // Filter models to only include those that support image generation
        const imageGenerationSupportedQueue = modelPriorityQueue.filter(({ provider, model }) => (0, supported_models_1.doesModelSupportImageGeneration)(provider, model));
        if (imageGenerationSupportedQueue.length === 0) {
            throw new errors_1.BadRequestError(`No valid providers found that support image generation. Please ensure that the models are correctly formatted and support image generation. You can visit ${constants_1.SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`);
        }
        // Get maxRetries from payload or use default
        const maxRetries = payload.maxRetries ?? 1;
        // Attempt execution for each model in the priority queue
        for (const { provider, model } of imageGenerationSupportedQueue) {
            console.log(`[IronaImageClient][generateImage] Attempting image generation with provider: ${provider}, model: ${model}`);
            // Try each model up to maxRetries times
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[IronaImageClient][generateImage] Attempt ${attempt}/${maxRetries} with ${provider}/${model}`);
                    // Get the appropriate image model instance
                    const imageModelInstance = this.getImageModelInstance(provider, model);
                    if (!imageModelInstance) {
                        throw new Error(`No image model instance found for provider: ${provider}`);
                    }
                    // Load API key for the selected provider
                    const apiKey = this.loadApiKeyForProvider(provider, model);
                    console.log(`[IronaImageClient][generateImage] 🎨 Generating image with ${provider}/${model} for prompt: "${prompt}"`);
                    // Generate image using the model instance
                    const { image } = await (0, ai_1.experimental_generateImage)({
                        model: imageModelInstance(model),
                        prompt: prompt,
                    });
                    console.log(`[IronaImageClient][generateImage] ✅ Successfully executed image generation with provider: ${provider}, model: ${model}`);
                    // Vercel AI SDK generateImage returns { image } where image can be:
                    // - { url: string } for URL format
                    // - { data: Buffer } for binary data
                    // - { base64Data: string } for base64 format
                    return {
                        response: {
                            content: image, // Image data as content (like chat completion)
                            role: "assistant",
                            type: "image", // Indicate this is an image response
                        },
                        provider,
                        model,
                        prompt,
                    };
                }
                catch (error) {
                    const errorMessage = error.message;
                    console.error(`[IronaImageClient][generateImage] Error with ${provider}/${model} (attempt ${attempt}/${maxRetries}): ${errorMessage}`);
                    // Check if this is a permanent error (like invalid model) that shouldn't be retried
                    const isPermanentError = errorMessage.includes('Invalid value') ||
                        errorMessage.includes('not found') ||
                        errorMessage.includes('No image model instance found') ||
                        errorMessage.includes('authentication') ||
                        errorMessage.includes('credentials');
                    if (isPermanentError) {
                        console.log(`[IronaImageClient][generateImage] Permanent error detected, skipping retries for ${provider}/${model}`);
                        break; // Skip retries for this model and move to next
                    }
                    // If this was the last attempt for this model, continue to next model
                    if (attempt === maxRetries) {
                        console.log(`[IronaImageClient][generateImage] All ${maxRetries} attempts failed for ${provider}/${model}, trying next model`);
                    }
                }
            }
        }
        // If all retries fail, throw an error
        throw new Error(`[IronaImageClient][generateImage] All attempts to generate image failed. Please verify the providers and models in your configuration.`);
    }
    /**
     * Gets the appropriate image model instance for image generation
     */
    getImageModelInstance(provider, model) {
        // Map of provider to their respective image model functions
        const providerImageModels = {
            openai: openai_1.openai.image,
            vertex: google_vertex_1.vertex.image, // Vertex AI does support image generation
        };
        return providerImageModels[provider];
    }
    /**
     * Selects the best image generation model using proper criteria
     */
    async selectBestImageGenerationModel(payload) {
        if (payload.models && payload.models.length === 1) {
            // Single model selection - filter by image generation capability
            const supportedProviderAndModelArray = (0, providerAndModelUtils_1.getSupportedProviderAndModelArray)(payload.models);
            const imageGenerationSupportedArray = supportedProviderAndModelArray.filter(({ provider, model }) => (0, supported_models_1.doesModelSupportImageGeneration)(provider, model));
            if (imageGenerationSupportedArray.length === 0) {
                // Don't throw error here - let fallback logic handle it
                return { provider: null, model: null };
            }
            return imageGenerationSupportedArray[0]; // Return the first supported provider/model
        }
        // Get supported models from the provided models array
        const supportedProviderAndModelArray = (0, providerAndModelUtils_1.getSupportedProviderAndModelArray)(payload.models);
        console.log(`[IronaImageClient][selectBestImageGenerationModel] All models:`, supportedProviderAndModelArray);
        // Filter models to only include those that support image generation
        const imageGenerationSupportedArray = supportedProviderAndModelArray.filter(({ provider, model }) => {
            const supportsImage = (0, supported_models_1.doesModelSupportImageGeneration)(provider, model);
            console.log(`[IronaImageClient][selectBestImageGenerationModel] ${provider}/${model} supports image generation: ${supportsImage}`);
            return supportsImage;
        });
        console.log(`[IronaImageClient][selectBestImageGenerationModel] Image generation supported models:`, imageGenerationSupportedArray);
        if (imageGenerationSupportedArray.length === 0) {
            console.warn(`[IronaImageClient][selectBestImageGenerationModel] No valid models found, will use fallback models`);
            return { provider: null, model: null };
        }
        // DUMMY RANDOM SELECTION - No router call, use random selection
        console.log(`[IronaImageClient][selectBestImageGenerationModel] Using dummy random selection (no router call)`);
        // Random selection logic with topk_models
        const topk_models = payload?.topk_models || 1;
        const selectedModels = this.getRandomModels(imageGenerationSupportedArray, topk_models);
        console.log(`[IronaImageClient][selectBestImageGenerationModel] Randomly selected ${selectedModels.length} model(s) from ${imageGenerationSupportedArray.length} available:`);
        selectedModels.forEach((model, index) => {
            console.log(`[IronaImageClient][selectBestImageGenerationModel]   ${index + 1}. ${model.provider}/${model.model}`);
        });
        // Return the first selected model for actual generation
        const selectedModel = selectedModels[0];
        console.log(`[IronaImageClient][selectBestImageGenerationModel] Selected model for generation: ${selectedModel.provider}/${selectedModel.model}`);
        return selectedModel;
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
}
exports.IronaImageClient = IronaImageClient;
