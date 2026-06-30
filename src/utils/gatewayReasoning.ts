import axios from 'axios';

import { logger } from './logger';
import type { ReasoningEffort } from './reasoningConfig';

export type GatewayEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'none';

export interface GatewayReasoning {
  effort?: GatewayEffort;
  max_tokens?: number;
  enabled?: boolean;
  exclude?: boolean;
}

type ConfigEffort = 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';

export interface ProviderReasoningPolicy {
  supported_efforts?: ConfigEffort[] | null;
  default_effort?: ConfigEffort | null;
  default_enabled?: boolean;
  supports_max_tokens?: boolean;
  max_budget?: number;
  mandatory?: boolean;
}

interface ReasoningConfig {
  gateway_effort_levels?: string[];
  effort_budget_ratios: Record<string, number>;
  budget_clamp: { min: number; max: number };
  providers: Record<
    string,
    { models: Record<string, ProviderReasoningPolicy> }
  >;
}

let CONFIG: ReasoningConfig | null = null;
const CONFIG_FETCH_TIMEOUT_MS = 5000;

export async function updateGatewayReasoningConfig(url: string): Promise<void> {
  try {
    const response = await axios.get(url, { timeout: CONFIG_FETCH_TIMEOUT_MS });
    const data = response.data;
    const parsed: unknown = typeof data === 'string' ? JSON.parse(data) : data;
    if (!isReasoningConfig(parsed)) {
      throw new Error(
        'Gateway reasoning config payload is malformed: expected object with `effort_budget_ratios`, `budget_clamp`, and `providers` keys.'
      );
    }
    CONFIG = parsed;
    logger.info('Gateway reasoning config loaded from remote source.');
  } catch (error) {
    logger.error('Failed to load gateway reasoning config from remote source.');
    throw error;
  }
}

function isReasoningConfig(value: unknown): value is ReasoningConfig {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.effort_budget_ratios !== null &&
    typeof obj.effort_budget_ratios === 'object' &&
    obj.budget_clamp !== null &&
    typeof obj.budget_clamp === 'object' &&
    obj.providers !== null &&
    typeof obj.providers === 'object'
  );
}

const SDK_TO_CONFIG_EFFORT: Record<
  Exclude<ReasoningEffort, 'off'>,
  ConfigEffort
> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  minimal: 'minimal',
  max: 'xhigh',
};

const EFFORT_ORDER: ConfigEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

export function getModelReasoningPolicy(
  provider: string | undefined,
  model: string | undefined
): ProviderReasoningPolicy | undefined {
  if (CONFIG === null || provider === undefined || model === undefined)
    return undefined;
  return CONFIG.providers[provider]?.models[model];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampEffortToSupported(
  requested: ConfigEffort,
  supported: ConfigEffort[],
  fallback: ConfigEffort | null | undefined
): ConfigEffort {
  if (supported.includes(requested)) return requested;
  const requestedIdx = EFFORT_ORDER.indexOf(requested);
  let best: ConfigEffort | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of supported) {
    const candidateIdx = EFFORT_ORDER.indexOf(candidate);
    const distance = Math.abs(candidateIdx - requestedIdx);
    const bestIdx = best === undefined ? -1 : EFFORT_ORDER.indexOf(best);
    if (
      distance < bestDistance ||
      (distance === bestDistance && candidateIdx > bestIdx)
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best ?? fallback ?? requested;
}

export function genericGatewayReasoning(
  effort: ReasoningEffort | undefined
): GatewayReasoning | undefined {
  if (effort === undefined || effort === 'off') return undefined;
  return { effort: SDK_TO_CONFIG_EFFORT[effort] };
}

export function resolveGatewayReasoning(
  effort: ReasoningEffort | undefined,
  provider?: string,
  model?: string
): GatewayReasoning | undefined {
  const policy = getModelReasoningPolicy(provider, model);

  if (policy === undefined) {
    return genericGatewayReasoning(effort);
  }

  if (effort === undefined || effort === 'off') {
    return undefined;
  }

  let level: ConfigEffort = SDK_TO_CONFIG_EFFORT[effort];
  if (Array.isArray(policy.supported_efforts)) {
    level = clampEffortToSupported(
      level,
      policy.supported_efforts,
      policy.default_effort
    );
  }

  if (
    policy.supports_max_tokens === true &&
    typeof policy.max_budget === 'number'
  ) {
    if (CONFIG === null) {
      logger.warn(
        `[gatewayReasoning] ${provider}/${model} reasons by token budget but the gateway reasoning config is not loaded; falling back to effort "${level}", which this model may not support.`
      );
    } else {
      const ratio = CONFIG.effort_budget_ratios[level] ?? 1;
      const budget = clamp(
        Math.floor(policy.max_budget * ratio),
        CONFIG.budget_clamp.min,
        CONFIG.budget_clamp.max
      );
      return { max_tokens: budget };
    }
  }

  return { effort: level };
}
