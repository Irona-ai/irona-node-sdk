/**
 * Local Router — zero-latency, zero-cost model selection.
 *
 * Classifies requests using a 15-dimension weighted scorer (ported from ClawRouter),
 * then maps the resulting tier to the cheapest suitable model from the user's
 * candidate list using pricing data from model_pricing.json.
 */

import { BadRequestError } from '../../errors';
import type { ModelInfo, ModelSelectResponse } from '../../responseTypes';
import type { ModelSelectPayload } from '../../schemas/modelSelect.schema';
import { ModelSelectSchema } from '../../schemas/modelSelect.schema';
import {
  doesModelSupportMediaTypes,
  getModelPrice,
  getModelCapabilities,
} from '../../supported_models';
import { SUPPORTED_MODELS_DEFAULT_URL } from '../../utils/constants';
import { logger } from '../../utils/logger';
import {
  extractMediaTypeArrayFromMessages,
  getSupportedProviderAndModelArray,
} from '../../utils/providerAndModelUtils';
import { validateSchema } from '../../utils/requestValidator';
import type { Router, ScoringConfig, Tier } from '../types';

import { classifyByRules } from './classifier';
import { DEFAULT_SCORING_CONFIG } from './config';

type ModelWithCost = ModelInfo & {
  cost: number;
  hasReasoning: boolean;
};

export class LocalRouter implements Router {
  private readonly scoringConfig: ScoringConfig;

  constructor(scoringConfigOverrides?: Partial<ScoringConfig>) {
    this.scoringConfig = scoringConfigOverrides
      ? { ...DEFAULT_SCORING_CONFIG, ...scoringConfigOverrides }
      : DEFAULT_SCORING_CONFIG;
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
        `[LocalRouter][modelSelect] Single model provided, returning directly: ${body.models[0]}`
      );
      return {
        providers: [mediaSupportedModels[0]],
        fallbackProviders: this.getFallbackProviders(body),
        error: null,
        success: true,
        message: 'Single model optimization - skipped local classification',
        statusCode: 200,
      };
    }

    // Extract prompt text from messages for classification
    const { prompt, systemPrompt } = this.extractPromptText(body.messages);
    const estimatedTokens = Math.ceil(
      `${systemPrompt ?? ''} ${prompt}`.length / 4
    );

    // Classify request
    const result = classifyByRules(
      prompt,
      systemPrompt,
      estimatedTokens,
      this.scoringConfig
    );
    const tier: Tier = result.tier ?? 'MEDIUM'; // Default ambiguous to MEDIUM

    logger.info(
      `[LocalRouter][modelSelect] Classified as ${tier} (confidence: ${result.confidence.toFixed(2)}, score: ${result.score.toFixed(2)}, signals: [${result.signals.join(', ')}])`
    );

    // Map tier to best model from user's candidates
    const selected = this.selectModelForTier(tier, mediaSupportedModels);

    return {
      providers: selected ? [selected] : mediaSupportedModels.slice(0, 1),
      fallbackProviders: this.getFallbackProviders(body),
      error: null,
      success: true,
      message: `Local router: ${tier} tier (confidence: ${result.confidence.toFixed(2)})`,
      statusCode: 200,
    };
  }

  /**
   * Select the best model for a given tier from the user's candidate list.
   *
   * Strategy:
   * - SIMPLE/MEDIUM: pick cheapest model
   * - COMPLEX: pick most expensive model (strongest)
   * - REASONING: prefer model with 'reasoning' capability, else most expensive
   */
  private selectModelForTier(
    tier: Tier,
    models: ModelInfo[]
  ): ModelInfo | null {
    if (models.length === 0) return null;
    if (models.length === 1) return models[0];

    const modelsWithCost: ModelWithCost[] = models.map(m => {
      const price = getModelPrice(m.provider, m.model);
      const capabilities = getModelCapabilities(m.provider, m.model);
      // Weight: 1 part input + 3 parts output (output is typically more significant)
      const cost = price ? price.input + 3 * price.output : 0;
      const hasReasoning = capabilities?.includes('reasoning') ?? false;
      return { ...m, cost, hasReasoning };
    });

    // Sort by cost ascending
    modelsWithCost.sort((a, b) => a.cost - b.cost);

    switch (tier) {
      case 'SIMPLE':
      case 'MEDIUM':
        // Cheapest model
        return modelsWithCost[0];

      case 'COMPLEX':
        // Most expensive (strongest)
        return modelsWithCost[modelsWithCost.length - 1];

      case 'REASONING': {
        // Prefer reasoning-capable model, else most expensive
        const reasoningModel = modelsWithCost.find(m => m.hasReasoning);
        return reasoningModel ?? modelsWithCost[modelsWithCost.length - 1];
      }

      default:
        return modelsWithCost[0];
    }
  }

  private extractPromptText(messages: ModelSelectPayload['messages']): {
    prompt: string;
    systemPrompt: string | undefined;
  } {
    let prompt = '';
    let systemPrompt: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system' && typeof msg.content === 'string') {
        systemPrompt = msg.content;
      } else if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          prompt += ' ' + msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if ('text' in part && typeof part.text === 'string') {
              prompt += ' ' + part.text;
            }
          }
        }
      }
    }

    return { prompt: prompt.trim(), systemPrompt };
  }

  private getFallbackProviders(body: ModelSelectPayload): ModelInfo[] {
    let fallbackProviders: ModelInfo[] = [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    ];

    if (body.fallback_models && body.fallback_models.length > 0) {
      try {
        fallbackProviders = body.fallback_models.map(modelPayload => {
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
