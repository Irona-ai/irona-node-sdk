import { experimental_generateImage as generateImage } from "ai";
import { openai } from "@ai-sdk/openai";
import { vertex } from "@ai-sdk/google-vertex"; // Add Vertex AI support
import { BadRequestError } from "../errors";
import { doesModelSupportImageGeneration } from "../supported_models";
import { validateSchema } from "../utils/requestValidator";
import { ImageGenerationPayload, ImageGenerationSchema } from "../schemas/imageGeneration.schema";
import { getSupportedProviderAndModelArray, validateAndGetProviderAndModel } from "../utils/providerAndModelUtils";
import { SUPPORTED_MODELS_DEFAULT_URL } from "../utils/constants";
import { IronaChatClient } from "./IronaChatClient";

export class IronaImageClient extends IronaChatClient {
  /**
   * Generates images based on the provided prompt and configuration
   */
  async generateImage(payload: ImageGenerationPayload) {
    // Validate input schema
    const validationResult = validateSchema(ImageGenerationSchema, payload);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    // Use prompt directly - no need to extract from messages
    const prompt = payload.prompt;
    if (!prompt) {
      throw new BadRequestError("Image generation requires a prompt");
    }

    // Select the best model using proper criteria
    const { provider, model } = await this.selectBestImageGenerationModel(payload);

    // Prepare the model priority queue for image generation
    // If `fallback_models` is provided in the payload, they will take precedence over `config.fallback_models`
    const modelPriorityQueue = [
      ...(provider && model ? [{ provider, model }] : []),
      ...(payload.fallback_models ?? this.config.fallback_models ?? []).map(
        (fallback: string) => validateAndGetProviderAndModel(fallback)
      ),
    ];

    // Filter models to only include those that support image generation
    const imageGenerationSupportedQueue = modelPriorityQueue.filter(
      ({ provider, model }) => doesModelSupportImageGeneration(provider, model)
    );

    if (imageGenerationSupportedQueue.length === 0) {
      throw new BadRequestError(
        `No valid providers found that support image generation. Please ensure that the models are correctly formatted and support image generation. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }

    // Get maxRetries from payload or use default
    const maxRetries = payload.maxRetries ?? 1;

    // Attempt execution for each model in the priority queue
    for (const { provider, model } of imageGenerationSupportedQueue) {
      console.log(
        `[IronaImageClient][generateImage] Attempting image generation with provider: ${provider}, model: ${model}`
      );

      // Try each model up to maxRetries times
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `[IronaImageClient][generateImage] Attempt ${attempt}/${maxRetries} with ${provider}/${model}`
          );

          // Get the appropriate image model instance
          const imageModelInstance = this.getImageModelInstance(provider, model);
          if (!imageModelInstance) {
            throw new Error(`No image model instance found for provider: ${provider}`);
          }

          // Load API key for the selected provider
          const apiKey = this.loadApiKeyForProvider(provider, model);

          // Generate image using the model instance
          const { image } = await generateImage({
            model: imageModelInstance(model),
            prompt: prompt,
          });

          console.log(`[IronaImageClient][generateImage] Successfully generated image with provider: ${provider}, model: ${model}`);

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
        } catch (error) {
          const errorMessage = (error as Error).message;
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
    throw new Error(
      `[IronaImageClient][generateImage] All attempts to generate image failed. Please verify the providers and models in your configuration.`
    );
  }

  /**
   * Gets the appropriate image model instance for image generation
   */
  private getImageModelInstance(provider: string, model: string) {
    // Map of provider to their respective image model functions
    const providerImageModels: Record<string, any> = {
      openai: openai.image,
      vertex: vertex.image, // Vertex AI does support image generation
    };
    return providerImageModels[provider as keyof typeof providerImageModels];
  }

  /**
   * Selects the best image generation model using proper criteria
   */
  private async selectBestImageGenerationModel(payload: ImageGenerationPayload) {
    if (payload.models && payload.models.length === 1) {
      // Single model selection - filter by image generation capability
      const supportedProviderAndModelArray = getSupportedProviderAndModelArray(payload.models);
      const imageGenerationSupportedArray = supportedProviderAndModelArray.filter(
        ({ provider, model }) => doesModelSupportImageGeneration(provider, model)
      );

      if (imageGenerationSupportedArray.length === 0) {
        // Don't throw error here - let fallback logic handle it
        return { provider: null, model: null };
      }

      return imageGenerationSupportedArray[0]; // Return the first supported provider/model
    }

    // For multiple models, try local filtering first before router
    const supportedProviderAndModelArray = getSupportedProviderAndModelArray(payload.models);
    console.log(`[IronaImageClient][selectBestImageGenerationModel] All models:`, supportedProviderAndModelArray);

    const imageGenerationSupportedArray = supportedProviderAndModelArray.filter(
      ({ provider, model }) => {
        const supportsImage = doesModelSupportImageGeneration(provider, model);
        console.log(`[IronaImageClient][selectBestImageGenerationModel] ${provider}/${model} supports image generation: ${supportsImage}`);
        return supportsImage;
      }
    );

    console.log(`[IronaImageClient][selectBestImageGenerationModel] Image generation supported models:`, imageGenerationSupportedArray);

    // If we have valid models locally, use the first one
    if (imageGenerationSupportedArray.length > 0) {
      console.log(`[IronaImageClient][selectBestImageGenerationModel] Found ${imageGenerationSupportedArray.length} valid models locally, using first one`);
      return imageGenerationSupportedArray[0];
    }

    // Only use router if no valid models found locally
    try {
      console.log(`[IronaImageClient][selectBestImageGenerationModel] No valid models found locally, trying router`);
      const response = await this.ironaRouter.modelSelectForImageGeneration(payload);

      // Handle errors from the model selection
      if (response && response.error) {
        console.warn(`[IronaImageClient][selectBestImageGenerationModel] Model selection error: ${JSON.stringify(response.error, null, 2)}`);
        return { provider: null, model: null };
      }

      // If router returns no providers, return null to trigger fallback
      if (!response.providers || response.providers.length === 0) {
        console.warn(`[IronaImageClient][selectBestImageGenerationModel] Router returned no valid providers, will use fallback models`);
        return { provider: null, model: null };
      }

      return response.providers[0];
    } catch (error) {
      console.error(`[IronaImageClient][selectBestImageGenerationModel] Model selection error: ${(error as Error).message}`);
      return { provider: null, model: null };
    }
  }
} 