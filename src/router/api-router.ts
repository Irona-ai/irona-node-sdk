/**
 * Generic API Router — works with any routing endpoint that accepts
 * {messages, llm_providers} and returns {providers}.
 *
 * Supports: NotDiamond, Irona-compatible endpoints, custom routers.
 * Swap routers by changing baseUrl + apiKey.
 */

import { MissingApiKeyError, BadRequestError } from '../errors';
import { Base } from '../ironlabs-router-client/base';
import type { ModelInfo, ModelSelectResponse } from '../responseTypes';
import type { ModelSelectPayload } from '../schemas/modelSelect.schema';
import { ModelSelectSchema } from '../schemas/modelSelect.schema';
import { doesModelSupportMediaTypes } from '../supported_models';
import { SUPPORTED_MODELS_DEFAULT_URL } from '../utils/constants';
import { logger } from '../utils/logger';
import {
  extractMediaTypeArrayFromMessages,
  getSupportedProviderAndModelArray,
} from '../utils/providerAndModelUtils';
import { validateSchema } from '../utils/requestValidator';
import { getTopKModels } from '../utils/topKModels';

import type { Router, APIRouterConfig } from './types';

export class APIRouter extends Base implements Router {
  private readonly routerApiKey: string;
  private readonly endpoint: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly extraBody: Record<string, unknown>;

  constructor(routerConfig: APIRouterConfig) {
    super({ baseUrl: routerConfig.baseUrl });
    this.routerApiKey = routerConfig.apiKey;
    this.endpoint = routerConfig.endpoint ?? '';
    this.extraHeaders = routerConfig.headers ?? {};
    this.extraBody = routerConfig.extraBody ?? {};

    if (!this.routerApiKey) {
      throw new MissingApiKeyError(
        'API router requires an API key. Provide it via config.router.apiKey or ROUTER_API_KEY env var.'
      );
    }
  }

  async modelSelect(body: ModelSelectPayload): Promise<ModelSelectResponse> {
    const validationResult = validateSchema(ModelSelectSchema, body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    const mediaInputsArray = extractMediaTypeArrayFromMessages(body.messages);
    const supportedModels = getSupportedProviderAndModelArray(body.models);
    const mediaSupportedModels = supportedModels.filter(({ provider, model }) =>
      doesModelSupportMediaTypes(provider, model, mediaInputsArray)
    );

    if (mediaSupportedModels.length === 0) {
      throw new BadRequestError(
        `No valid providers found that support the media types ${mediaInputsArray.join(
          ', '
        )}. Please ensure that the models are correctly formatted and support the required media types. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }

    // Single model optimization
    if (body.models.length === 1) {
      logger.info(
        `[APIRouter][modelSelect] Single model provided, returning directly: ${body.models[0]}`
      );
      return {
        providers: [mediaSupportedModels[0]],
        fallbackProviders: this.getFallbackProviders(body),
        error: null,
        success: true,
        message: 'Single model optimization - skipped API router call',
        statusCode: 200,
      };
    }

    const payload = {
      messages: body.messages,
      llm_providers: mediaSupportedModels,
      topk_models: getTopKModels(body),
      kwargs: body?.kwargs,
      ...this.extraBody,
    };

    if (mediaSupportedModels.length === 0) {
      throw new BadRequestError(
        `No valid providers found in the request. Please ensure that the models are correctly formatted. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }

    try {
      logger.info(
        `[APIRouter][modelSelect] Calling ${this.endpoint} with ${mediaSupportedModels.length} models`
      );

      const result = await this.request<ModelSelectResponse>(this.endpoint, {
        method: 'POST',
        data: payload,
        headers: {
          Authorization: 'Bearer ' + this.routerApiKey,
          'Content-Type': 'application/json',
          ...this.extraHeaders,
        },
      });

      if (result?.error !== null && result?.error !== undefined) {
        result.fallbackProviders = this.getFallbackProviders(body);
        return result;
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  private getFallbackProviders(body: ModelSelectPayload): ModelInfo[] {
    let fallbackProviders: ModelInfo[] = [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
    ];

    if (body.fallbackModels && body.fallbackModels.length > 0) {
      try {
        fallbackProviders = body.fallbackModels.map(modelPayload => {
          const [provider, ...modelParts] = modelPayload.split('/');
          const model = modelParts.join('/');
          return { provider, model };
        });
      } catch (error) {
        logger.error(`Error parsing fallback models: ${error}`);
      }
    }

    return fallbackProviders;
  }
}
