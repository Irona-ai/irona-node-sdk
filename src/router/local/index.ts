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

    const providers: ModelInfo[] = selected
      ? [selected]
      : mediaSupportedModels.slice(0, 1);

    // Arcade mode: select a second model when topkModels >= 2
    const topK = body.topkModels ?? body.topk_models ?? 1;
    if (topK >= 2 && providers.length > 0 && mediaSupportedModels.length > 1) {
      const secondModel = this.selectSecondModel(
        tier,
        providers[0],
        mediaSupportedModels
      );
      if (secondModel !== null) {
        providers.push(secondModel);
      }
    }

    return {
      providers,
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
   * Models are sorted by cost ascending, then mapped to tiers:
   *
   * With 2 models:  SIMPLE/MEDIUM → cheapest, COMPLEX/REASONING → most expensive
   * With 3 models:  SIMPLE → cheapest, MEDIUM → middle, COMPLEX → most expensive,
   *                 REASONING → most expensive with reasoning capability
   * With 4+ models: SIMPLE → cheapest, MEDIUM → 2nd cheapest,
   *                 COMPLEX → 2nd most expensive,
   *                 REASONING → most expensive with reasoning capability
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

    const n = modelsWithCost.length;

    switch (tier) {
      case 'SIMPLE':
        // Always cheapest
        return modelsWithCost[0];

      case 'MEDIUM':
        // For ≤2 models: same as cheapest; for 3+: second cheapest
        return n <= 2 ? modelsWithCost[0] : modelsWithCost[1];

      case 'COMPLEX':
        // For ≤2 models: most expensive; for 3+: second most expensive
        return n <= 2 ? modelsWithCost[n - 1] : modelsWithCost[n - 2];

      case 'REASONING': {
        // Most expensive model with reasoning capability (search from top)
        for (let i = n - 1; i >= 0; i--) {
          if (modelsWithCost[i].hasReasoning) return modelsWithCost[i];
        }
        // Fallback: most expensive
        return modelsWithCost[n - 1];
      }

      default:
        return modelsWithCost[0];
    }
  }

  /**
   * Select a second model for arcade mode (topkModels >= 2).
   *
   * 80% of the time: picks a stronger model (one tier above the first).
   *   If already at REASONING (highest tier), picks one tier below (COMPLEX).
   * 20% of the time: picks randomly from remaining candidates.
   */
  private selectSecondModel(
    currentTier: Tier,
    firstModel: ModelInfo,
    candidates: ModelInfo[]
  ): ModelInfo | null {
    const otherModels = candidates.filter(
      m => !(m.provider === firstModel.provider && m.model === firstModel.model)
    );
    if (otherModels.length === 0) return null;

    // 20% random selection from remaining models
    if (Math.random() < 0.2) {
      return otherModels[Math.floor(Math.random() * otherModels.length)];
    }

    // 80% stronger model — one tier above (or below if at highest)
    const tierOrder: Tier[] = ['SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING'];
    const currentIndex = tierOrder.indexOf(currentTier);
    const targetTier =
      currentIndex >= tierOrder.length - 1
        ? tierOrder[currentIndex - 1] // At REASONING → COMPLEX
        : tierOrder[currentIndex + 1]; // Go stronger

    return this.selectModelForTier(targetTier, otherModels) ?? otherModels[0];
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
