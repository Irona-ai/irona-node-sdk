import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai';

import { doesModelSupportReasoning } from '../supported_models';

import { logger } from './logger';

export type ReasoningEffort =
  | 'off'
  | 'low'
  | 'minimal'
  | 'medium'
  | 'high'
  | 'max'
  | 'xhigh';

export interface GoogleThinkingConfig {
  thinkingBudget?: number;
  includeThoughts: boolean;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}

// OpenAI's reasoning `effort` accepts a fixed set that is NOT the same as the
// SDK's `ReasoningEffort` — there is no `'off'`/`'max'`; disabling is `'none'`
// and the top tier is `'xhigh'`.
export type OpenAIEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export interface OpenAIReasoningConfig {
  effort?: OpenAIEffort;
  reasoningSummary?: 'auto' | 'detailed';
}

export interface AnthropicThinkingConfig {
  type: 'enabled' | 'disabled';
  budgetTokens?: number;
}
export interface TogetherAIReasoningConfig {
  includeReasoning: boolean;
}
export interface MistralReasoningConfig {
  includeReasoning: boolean;
}
export interface PerplexityReasoningConfig {
  effort: ReasoningEffort;
}
export interface XAIReasoningConfig {
  reasoningEffort: ReasoningEffort;
}
type ProviderName =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'togetherai'
  | 'mistral'
  | 'perplexity'
  | 'xai';

export interface ProviderReasoningOptions {
  google?: { thinkingConfig: GoogleThinkingConfig };
  openai?: OpenAIReasoningConfig;
  anthropic?: { thinking: AnthropicThinkingConfig };
  togetherai?: { reasoning: TogetherAIReasoningConfig };
  mistral?: { reasoning: MistralReasoningConfig };
  perplexity?: { reasoning: PerplexityReasoningConfig };
  xai?: XAIReasoningConfig;
}

export class ReasoningConfig {
  private static readonly EFFORT_MAPPING: Record<ReasoningEffort, number> = {
    off: 0.0,
    minimal: 0.1,
    low: 0.25,
    medium: 0.5,
    high: 0.75,
    max: 0.9,
    xhigh: 1.0,
  };

  static getReasoningConfig(
    provider: ProviderName,
    model: string,
    reasoningEffort: ReasoningEffort
  ): ProviderReasoningOptions | null {
    const isOff = reasoningEffort === 'off';
    const multiplier = ReasoningConfig.EFFORT_MAPPING[reasoningEffort];

    switch (provider) {
      case 'google':
        if (model.includes('gemini')) {
          // Special handling for gemini-3
          if (model.includes('gemini-3')) {
            if (isOff) {
              return null;
            }

            let thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';

            if (model.includes('gemini-3-flash')) {
              // Gemini 3 Flash supports: 'minimal', 'low', 'medium', 'high'
              switch (reasoningEffort) {
                case 'minimal':
                  thinkingLevel = 'minimal';
                  break;
                case 'low':
                  thinkingLevel = 'low';
                  break;
                case 'medium':
                  thinkingLevel = 'medium';
                  break;
                case 'high':
                case 'max':
                case 'xhigh':
                  // 'max'/'xhigh' clamp up to the model's top tier 'high'
                  thinkingLevel = 'high';
                  break;
                default:
                  thinkingLevel = 'low';
              }
            } else {
              // Other Gemini 3 models support: 'low', 'high'
              switch (reasoningEffort) {
                case 'high':
                case 'max':
                case 'xhigh':
                  // 'max'/'xhigh' clamp up to the model's top tier 'high'
                  thinkingLevel = 'high';
                  break;
                default:
                  // 'minimal'/'low'/'medium' round down to the floor tier 'low'
                  thinkingLevel = 'low';
              }
            }

            return {
              google: {
                thinkingConfig: {
                  includeThoughts: true,
                  thinkingLevel,
                },
              },
            };
          }

          let thinkingBudget: number;
          let includeThoughts: boolean;

          // Special handling for gemini-2.5-pro
          if (model.includes('2.5-pro')) {
            // Gemini 2.5-pro cannot disable thinking, minimum is 128 tokens
            thinkingBudget = isOff ? 128 : Math.floor(32768 * multiplier);
            includeThoughts = true; // Always include thoughts for this model
          } else {
            // Regular Gemini models
            const maxBudget = 24567;
            thinkingBudget = isOff ? 0 : Math.floor(maxBudget * multiplier);
            includeThoughts = !isOff;
          }

          return {
            google: {
              thinkingConfig: {
                thinkingBudget,
                includeThoughts,
              },
            },
          };
        }
        break;

      case 'openai': {
        // OpenAI accepts none|minimal|low|medium|high|xhigh. Map the SDK values
        // that don't exist on OpenAI: 'off' → 'none', 'max' → top tier 'xhigh'.
        let openaiEffort: OpenAIEffort;
        switch (reasoningEffort) {
          case 'off':
            openaiEffort = 'none';
            break;
          case 'max':
            openaiEffort = 'xhigh';
            break;
          default:
            openaiEffort = reasoningEffort;
        }
        return {
          openai: {
            effort: openaiEffort,
            reasoningSummary: 'auto',
          },
        };
      }

      case 'anthropic':
        if (model.includes('claude')) {
          let maxBudget: number;
          if (model.includes('opus')) {
            maxBudget = 32000;
          } else {
            maxBudget = 64000;
          }
          return {
            anthropic: {
              thinking: {
                type: isOff ? 'disabled' : 'enabled',
                budgetTokens: isOff
                  ? undefined
                  : Math.floor(maxBudget * multiplier),
              },
            } satisfies AnthropicProviderOptions,
          };
        }
        break;

      case 'togetherai':
        if (model.includes('DeepSeek-R1')) {
          return {
            togetherai: {
              reasoning: { includeReasoning: !isOff },
            },
          };
        }
        break;

      case 'mistral':
        return {
          mistral: {
            reasoning: { includeReasoning: !isOff },
          },
        };

      case 'perplexity':
        return {
          perplexity: {
            reasoning: { effort: reasoningEffort },
          },
        };
      case 'xai':
        if (model.includes('grok')) {
          // xAI doesn't support 'medium' effort level - map to 'low'
          const mappedReasoningEffort =
            reasoningEffort === 'medium' ? 'low' : reasoningEffort;

          return {
            xai: {
              reasoningEffort: mappedReasoningEffort,
            },
          };
        }
        break;
    }

    return null;
  }

  static applyReasoningConfig<T extends { providerOptions?: unknown }>(
    config: T,
    provider: string,
    model: string,
    reasoningEffort?: ReasoningEffort
  ): T {
    const effectiveReasoningEffort = reasoningEffort ?? 'off';

    if (!doesModelSupportReasoning(provider, model)) {
      if (reasoningEffort !== undefined && reasoningEffort !== 'off') {
        logger.warn(
          `[ReasoningConfig] Reasoning not supported for ${provider}/${model}, ignoring reasoningEffort`
        );
      }
      return config;
    }

    const reasoningConfig = this.getReasoningConfig(
      provider as ProviderName,
      model,
      effectiveReasoningEffort
    );
    if (reasoningConfig) {
      config.providerOptions =
        reasoningConfig as unknown as T['providerOptions'];
    }

    return config;
  }

  static supportsReasoningMiddleware(
    provider: ProviderName,
    model: string
  ): boolean {
    const providersWithMiddleware = ['togetherai', 'mistral', 'perplexity'];

    // Check if provider supports middleware
    if (!providersWithMiddleware.includes(provider)) {
      return false;
    }
    const modelName = model.includes('/') ? model.split('/').pop()! : model;
    const supportsReasoning = doesModelSupportReasoning(provider, modelName);

    if (!supportsReasoning) {
      logger.warn(
        `[ReasoningConfig] Reasoning middleware not supported for ${provider}/${model}. The model does not support reasoning capabilities.`
      );
    }
    return supportsReasoning;
  }

  static createEnhancedModelWithReasoning(
    baseModel: LanguageModel,
    reasoningEffort?: ReasoningEffort
  ) {
    const shouldIncludeReasoning =
      reasoningEffort !== undefined && reasoningEffort !== 'off';

    if (!shouldIncludeReasoning) {
      return baseModel;
    }

    if (typeof baseModel === 'string') {
      throw new Error(
        `[ReasoningConfig] baseModel cannot be a string when applying reasoning middleware. Received: ${baseModel}`
      );
    }

    return wrapLanguageModel({
      model: baseModel,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    });
  }
}
