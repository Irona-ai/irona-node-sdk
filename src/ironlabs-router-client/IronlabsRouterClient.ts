import { MissingApiKeyError, BadRequestError } from '../errors';
import { ModelInfo, ModelSelectResponse } from '../responseTypes';
import type { Router } from '../router/types';
import type { ModelSelectPayload } from '../schemas/modelSelect.schema';
import { ModelSelectSchema } from '../schemas/modelSelect.schema';
import { doesModelSupportMediaTypes } from '../supported_models';
import type { Config } from '../types';
import { SUPPORTED_MODELS_DEFAULT_URL } from '../utils/constants';
import { logger } from '../utils/logger';
import {
  extractMediaTypeArrayFromMessages,
  getSupportedProviderAndModelArray,
} from '../utils/providerAndModelUtils';
import { validateSchema } from '../utils/requestValidator';

import { Base } from './base';
export { ModelInfo, ModelSelectResponse };

const resources = '';

export class IronlabsRouterClient extends Base implements Router {
  constructor(config: Config) {
    super(config);
  }

  async modelSelect(body: ModelSelectPayload): Promise<ModelSelectResponse> {
    const apiKey = process.env.IRONLABS_AI_API_KEY ?? '';
    if (!apiKey) {
      throw new MissingApiKeyError(
        'The IRONLABS_AI_API_KEY environment variable is missing or empty. Please ensure that the IRONLABS_AI_API_KEY is set in the environment variables.'
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
          ', '
        )}. Please ensure that the models are correctly formatted and support the required media types. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }

    // Single model optimization - skip API call if only one model provided
    if (body.models.length === 1) {
      logger.info(
        `[IronlabsRouterClient][modelSelect] Single model provided, skip-API call, returning directly: ${body.models[0]}`
      );
      return {
        providers: [mediaSupportedProviderAndModelArray[0]],
        fallbackProviders: this.getFallbackProviders(body),
        error: null,
        success: true,
        message: 'Single model optimization - skipped router API call',
        statusCode: 200,
      };
    }
    const formattedPayload = {
      topk_models: body?.topkModels,
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
      const result = await this.request<ModelSelectResponse>(`${resources}`, {
        method: 'POST',
        data: formattedPayload,
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
      });

      // If the API returned an error, add fallback providers
      if (result?.error !== null && result?.error !== undefined) {
        result.fallbackProviders = this.getFallbackProviders(body);
        return result;
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  // Helper method to get fallback providers either from the request or defaults
  private getFallbackProviders(body: ModelSelectPayload): ModelInfo[] {
    // Default fallback_providers
    let fallbackProviders: ModelInfo[] = [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
    ];

    // Use fallback_providers if they are provided in the request
    if (body.fallbackModels && body.fallbackModels.length > 0) {
      try {
        fallbackProviders = body.fallbackModels.map(modelPayload => {
          const [provider, ...modelParts] = modelPayload.split('/');
          const model = modelParts.join('/');
          return { provider, model };
        });
      } catch (error) {
        logger.error(`Error parsing fallback models: ${error}`);
        // Keep the default fallback providers if there's an error
      }
    }

    return fallbackProviders;
  }
}
