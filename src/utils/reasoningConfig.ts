import type { LanguageModel } from 'ai';
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai';
import axios from 'axios';

import { doesModelSupportReasoning } from '../supported_models';

import { logger } from './logger';

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

export interface GoogleThinkingConfig {
  thinkingBudget?: number;
  includeThoughts: boolean;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}

export interface OpenAIReasoningConfig {
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
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
export type ProviderName =
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

// ── Shape of reasoning_config.json ───────────────────────────────────────────
interface ReasoningRule {
  when: { default?: boolean; model_includes?: string };
  off_returns_null?: boolean;
  derive?: {
    budget?: { max_budget: number; off: number | '$omit' };
    level?: { map: Record<string, string>; default: string };
    effort?: { passthrough?: boolean; remap?: Record<string, string> };
    includeThoughts?: { not_off: boolean };
    includeReasoning?: { not_off: boolean };
  };
  provider_options: Record<string, unknown>;
}
interface ProviderConfig {
  supports_middleware?: boolean;
  match_against?: 'model' | 'provider';
  rules: ReasoningRule[];
}
interface ReasoningConfigFile {
  effort_multipliers: Record<ReasoningEffort, number>;
  providers: Record<string, ProviderConfig>;
}

// Loaded at runtime from the llm-pricing-info repo (single source of truth) —
// the same way model pricing is fetched in `supported_models.ts`. Stays `null`
// until `updateReasoningConfig()` resolves; every consumer degrades gracefully
// (no reasoning options applied) while it is unset, so a failed/slow fetch never
// breaks completions — it just means reasoning options aren't attached.
let CONFIG: ReasoningConfigFile | null = null;
const OMIT = '$omit';

/**
 * Fetches the declarative reasoning config from the remote source and caches it
 * in-module. Mirrors `updateProvidersFromGist` — call once during SDK init.
 */
export async function updateReasoningConfig(
  REASONING_CONFIG_URL: string
): Promise<void> {
  try {
    const response = await axios.get(REASONING_CONFIG_URL);
    const data = response.data;
    CONFIG = (
      typeof data === 'string' ? JSON.parse(data) : data
    ) as ReasoningConfigFile;
    logger.info('Reasoning config loaded from remote source.');
  } catch (error) {
    logger.error('Failed to load Reasoning config from remote source.');
    throw error;
  }
}

export class ReasoningConfig {
  static getReasoningConfig(
    provider: ProviderName,
    model: string,
    reasoningEffort: ReasoningEffort
  ): ProviderReasoningOptions | null {
    if (CONFIG === null) {
      logger.warn(
        '[ReasoningConfig] Reasoning config not loaded yet; skipping reasoning options.'
      );
      return null;
    }
    const providerCfg = CONFIG.providers[provider];
    if (providerCfg === undefined) return null;

    const isOff = reasoningEffort === 'off';
    const multiplier = CONFIG.effort_multipliers[reasoningEffort];

    // First matching rule wins (mirrors the old `model.includes(...)` cascade).
    const target = providerCfg.match_against === 'provider' ? provider : model;
    const rule = providerCfg.rules.find(
      r =>
        r.when.default === true ||
        (r.when.model_includes != null &&
          target.includes(r.when.model_includes))
    );
    if (!rule) return null;
    if (rule.off_returns_null === true && isOff) return null;

    // Resolve placeholder values for this (model, effort) pair.
    const vars: Record<string, unknown> = {
      $enabled: isOff ? 'disabled' : 'enabled',
      $includeThoughts: !isOff,
      $includeReasoning: !isOff,
    };
    const d = rule.derive ?? {};
    if (d.budget) {
      vars.$budget = isOff
        ? d.budget.off
        : Math.floor(d.budget.max_budget * multiplier);
    }
    if (d.level) {
      vars.$level = d.level.map[reasoningEffort] ?? d.level.default;
    }
    if (d.effort) {
      vars.$effort =
        d.effort.passthrough === true
          ? reasoningEffort
          : (d.effort.remap?.[reasoningEffort] ?? reasoningEffort);
    }

    const filled = ReasoningConfig.fillTemplate(rule.provider_options, vars);
    return filled as ProviderReasoningOptions;
  }

  /**
   * Recursively substitutes `$placeholder` strings and drops any key whose
   * resolved value is the `$omit` sentinel.
   */
  private static fillTemplate(
    node: unknown,
    vars: Record<string, unknown>
  ): unknown {
    if (typeof node === 'string' && node.startsWith('$')) {
      return vars[node];
    }
    if (Array.isArray(node)) {
      return node.map(v => ReasoningConfig.fillTemplate(v, vars));
    }
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        const resolved = ReasoningConfig.fillTemplate(value, vars);
        if (resolved === OMIT) continue;
        out[key] = resolved;
      }
      return out;
    }
    return node;
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
    // Driven by `supports_middleware` in reasoning_config.json.
    if (CONFIG === null) return false;
    if (CONFIG.providers[provider]?.supports_middleware !== true) {
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
