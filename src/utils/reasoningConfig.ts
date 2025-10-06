import { doesModelSupportReasoning } from "../supported_models";
import { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai';

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

export interface GoogleThinkingConfig {
  thinkingBudget: number;
  includeThoughts: boolean;
}

export interface OpenAIReasoningConfig {
  effort?: ReasoningEffort;
  reasoningSummary?: 'auto' | 'detailed';
}

export interface AnthropicThinkingConfig {
  type: "enabled" | "disabled";
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
type ProviderName = 'google' | 'openai' | 'anthropic' | 'togetherai' | 'mistral' | 'perplexity' | "xai";

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
    low: 0.25,
    medium: 0.5,
    high: 0.85,
    max: 1.0
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
        if (model.includes("gemini")) {
          let thinkingBudget: number;
          let includeThoughts: boolean;

          // Special handling for gemini-2.5-pro
          if (model.includes("2.5-pro")) {
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
                includeThoughts
              }
            }
          };
        }
        break;

      case 'openai':
        if (isOff) {
          return null; 
        }
        return {
          openai: {
            effort: reasoningEffort,
            reasoningSummary: 'auto', 
          }
        };

      case 'anthropic':
        if (model.includes("claude")) {
          const maxBudget = 20000;
          return {
            anthropic: {
              thinking: {
                type: isOff ? "disabled" : "enabled",
                budgetTokens: isOff ? undefined : Math.floor(maxBudget * multiplier),
              },
            } satisfies AnthropicProviderOptions,
          };
        }
        break;

      case 'togetherai':
        if (model.includes("DeepSeek-R1")) {
          return {
            togetherai: {
              reasoning: { includeReasoning: !isOff }
            }
          };
        }
        break;

      case 'mistral':
        return {
          mistral: {
            reasoning: { includeReasoning: !isOff }
          }
        };

      case 'perplexity':
        return {
          perplexity: {
            reasoning: { effort: reasoningEffort }
          }
        };

      case 'xai':
        if (model.includes("grok")) {
          return {
            xai: {
              reasoningEffort: reasoningEffort
            }
          };
        }
        break;
      }

    return null;
  }

  static applyReasoningConfig(
    config: any,
    provider: string,
    model: string,
    reasoningEffort?: ReasoningEffort
  ): any {
    const effectiveReasoningEffort = reasoningEffort ?? 'off';

    if (!doesModelSupportReasoning(provider, model)) {
      if (reasoningEffort !== undefined && reasoningEffort !== 'off') {
        console.warn(`[ReasoningConfig] Reasoning not supported for ${provider}/${model}, ignoring reasoning_effort`);
      }
      return config;
    }

    const reasoningConfig = this.getReasoningConfig(provider as ProviderName, model, effectiveReasoningEffort);
    if (reasoningConfig) {
      config.providerOptions = reasoningConfig;
    }

    return config;
  }
  

  static supportsReasoningMiddleware(provider: ProviderName, model: string): boolean {
    const providersWithMiddleware = ['togetherai', 'mistral', 'perplexity'];

    // Check if provider supports middleware
    if (!providersWithMiddleware.includes(provider)) {
      return false;
    }
    const modelName = model.includes('/') ? model.split('/').pop()! : model;
    const supportsReasoning = doesModelSupportReasoning(provider, modelName);

    if (!supportsReasoning) {
      console.warn(`[ReasoningConfig] Reasoning middleware not supported for ${provider}/${model}. The model does not support reasoning capabilities.`);
    }
    return supportsReasoning;
  }

  static createEnhancedModelWithReasoning(
    baseModel: any,
    reasoningEffort?: ReasoningEffort
  ) {
    const shouldIncludeReasoning = reasoningEffort !== undefined && reasoningEffort !== 'off';

    if (!shouldIncludeReasoning) {
      return baseModel;
    }

    return wrapLanguageModel({
      model: baseModel,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    });
  }
}