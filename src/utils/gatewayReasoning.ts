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
  version: string;
  effort_budget_ratios: Record<string, number>;
  budget_clamp: { min: number; max: number };
  providers: Record<string, ProviderReasoningPolicy>;
}

let CONFIG: ReasoningConfig | null = null;

export async function updateGatewayReasoningConfig(url: string): Promise<void> {
  try {
    const response = await axios.get(url);
    const data = response.data;
    CONFIG = (
      typeof data === 'string' ? JSON.parse(data) : data
    ) as ReasoningConfig;
    logger.info('Gateway reasoning config loaded from remote source.');
  } catch (error) {
    logger.error('Failed to load gateway reasoning config from remote source.');
    throw error;
  }
}

const SDK_TO_CONFIG_EFFORT: Record<
  Exclude<ReasoningEffort, 'off'>,
  ConfigEffort
> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
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

export function getProviderReasoningPolicy(
  provider: string | undefined
): ProviderReasoningPolicy | undefined {
  if (CONFIG === null || provider === undefined) return undefined;
  return CONFIG.providers[provider];
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
  provider?: string
): GatewayReasoning | undefined {
  const policy = getProviderReasoningPolicy(provider);

  // Config not loaded yet, or provider without a policy — generic passthrough.
  if (CONFIG === null || policy === undefined) {
    return genericGatewayReasoning(effort);
  }

  // 'off'/undefined omit the field. For mandatory-reasoning providers this lets
  // the model keep its forced default instead of being handed enabled:false.
  if (effort === undefined || effort === 'off') {
    return undefined;
  }

  // Map the SDK effort onto the config's effort vocabulary (max → xhigh).
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
    // Budget-based providers (e.g. Anthropic) reason by token budget.
    const ratio = CONFIG.effort_budget_ratios[level] ?? 1;
    const budget = clamp(
      Math.floor(policy.max_budget * ratio),
      CONFIG.budget_clamp.min,
      CONFIG.budget_clamp.max
    );
    return { max_tokens: budget };
  }

  // Effort-based providers send the wire effort value verbatim.
  return { effort: level };
}
