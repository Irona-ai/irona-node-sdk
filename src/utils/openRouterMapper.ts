import { genericGatewayReasoning } from './gatewayReasoning';
import type { GatewayReasoning } from './gatewayReasoning';
import type { ReasoningEffort } from './reasoningConfig';

// ── Types ────────────────────────────────────────────────────────────────────

// OpenRouter's `reasoning` object is the unified gateway reasoning shape.
export type OpenRouterReasoningConfig = GatewayReasoning;

export interface OpenRouterSearchConfig {
  plugins: Array<{ id: string }>;
}

export interface OpenRouterProviderConfig {
  sort?: string;
  order?: string[];
  only?: string[];
  ignore?: string[];
  allow_fallbacks?: boolean;
}

export interface OpenRouterExtraBody {
  reasoning?: OpenRouterReasoningConfig;
  plugins?: Array<{ id: string }>;
  provider?: OpenRouterProviderConfig;
  /** Enables OpenRouter usage accounting so the response includes the real
   * per-request cost (`usage.cost` / `usage.cost_details`). */
  usage?: { include: boolean };
}

export interface BuildOpenRouterExtraBodyInput {
  reasoningEffort?: ReasoningEffort;
  search?: boolean;
  supportsWebSearch: boolean;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

/**
 * Maps SDK reasoningEffort to OpenRouter's `reasoning` config without per-model
 * metadata. Returns `undefined` when no reasoning key should be sent.
 *
 * 'off' and undefined both mean "don't send a reasoning field" so that models
 * which mandate reasoning (e.g. gpt-5-nano, gemini-2.5-flash) use their own
 * default instead of rejecting a `{ effort: 'none' }` payload.
 */
export function mapReasoningToOpenRouter(
  effort: ReasoningEffort | undefined
): OpenRouterReasoningConfig | undefined {
  return genericGatewayReasoning(effort);
}

/**
 * Maps SDK `search` boolean to OpenRouter's plugin format.
 * Returns `undefined` when search is not requested or unsupported.
 */
export function mapSearchToOpenRouter(
  search: boolean | undefined,
  supportsWebSearch: boolean
): OpenRouterSearchConfig | undefined {
  if (search !== true || !supportsWebSearch) {
    return undefined;
  }
  return {
    plugins: [{ id: 'web' }],
  };
}

/**
 * Builds the merged extra body for an OpenRouter request.
 * Always includes `provider.sort: "latency"` to prefer the lowest-latency
 * provider, and `usage.include: true` so the response carries the real
 * per-request cost (surfaced via the onCost callback as `llmgateway-cost`).
 *
 * Reasoning is resolved from the provider's policy in reasoningConfig.json when
 * `provider` is supplied.
 */
export function buildOpenRouterExtraBody(
  input: BuildOpenRouterExtraBodyInput
): OpenRouterExtraBody {
  const reasoning = genericGatewayReasoning(input.reasoningEffort);
  const search = mapSearchToOpenRouter(input.search, input.supportsWebSearch);

  const extra: OpenRouterExtraBody = {
    provider: { sort: 'latency' },
    usage: { include: true },
  };
  if (reasoning !== undefined) {
    extra.reasoning = reasoning;
  }
  if (search !== undefined) {
    extra.plugins = search.plugins;
  }
  return extra;
}
