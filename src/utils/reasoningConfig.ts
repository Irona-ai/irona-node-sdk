import { doesModelSupportReasoning } from "../supported_models";
import { AnthropicProviderOptions } from "@ai-sdk/anthropic";

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

export interface GoogleThinkingConfig {
  thinkingBudget: number;
  includeThoughts: boolean;
}

export interface OpenAIReasoningConfig {
  effort: ReasoningEffort;
}

export interface AnthropicThinkingConfig {
  type: "enabled" | "disabled";
  budgetTokens?: number;
}

export interface ProviderReasoningOptions {
  google?: { thinkingConfig: GoogleThinkingConfig };
  openai?: { reasoning: OpenAIReasoningConfig };
  anthropic?: { thinking: AnthropicThinkingConfig };
}

export class ReasoningConfig {
  private static readonly EFFORT_MAPPING = {
    off: 0.0,     // 0% effort
    low: 0.25,    // 25% effort
    medium: 0.5,  // 50% effort
    high: 0.85,   // 85% effort
    max: 1.0      // 100% effort
  };


  static getReasoningConfig(
    provider: string,
    model: string,
    reasoningEffort: ReasoningEffort
  ): ProviderReasoningOptions | null {


    const isOff = reasoningEffort === 'off';
    const multiplier = ReasoningConfig.EFFORT_MAPPING[reasoningEffort];

    if (provider === 'google' && model.includes("gemini")) {
      const maxBudget = 4096;
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: isOff ? 0 : Math.floor(maxBudget * multiplier),
            includeThoughts: !isOff
          }
        }
      };
    }

    if (provider === "openai") {
      return {
        openai: {
          reasoning: {
            effort: reasoningEffort
          }
        }
      };
    }

    if (provider === "anthropic" && model.includes("claude")) {
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

    return null;
  }

 static applyReasoningConfig(
    config: any,
    provider: string,
    model: string,
    reasoningEffort?: ReasoningEffort
  ): any {

    const effectiveReasoningEffort = reasoningEffort !== undefined ? reasoningEffort : 'off';
    
    const supportsReasoning = doesModelSupportReasoning(provider, model);
    
    if (supportsReasoning) {
      const reasoningConfig = this.getReasoningConfig(provider, model, effectiveReasoningEffort);
      if (reasoningConfig) {
        config.providerOptions = reasoningConfig;
        console.log(
          `[ReasoningConfig] Applied reasoning config for ${provider}/${model}:`,
          reasoningConfig
        );
      }
    } else if (reasoningEffort !== undefined) {
 
      console.warn(`[ReasoningConfig] Reasoning not supported for ${provider}/${model}, ignoring reasoning_effort`);
    }
    
    return config;
  }

}