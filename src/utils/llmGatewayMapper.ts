import { genericGatewayReasoning } from './gatewayReasoning';
import type { GatewayReasoning } from './gatewayReasoning';
import type { ReasoningEffort } from './reasoningConfig';

// ── Types ────────────────────────────────────────────────────────────────────

// LLM Gateway's `reasoning` object is the unified gateway reasoning shape — the
// same one OpenRouter accepts. The gateway translates it per provider.
export type LLMGatewayReasoningConfig = GatewayReasoning;

export interface LLMGatewayExtraBody {
  reasoning?: LLMGatewayReasoningConfig;
  // LLM Gateway exposes web search via a top-level boolean (`web_search`),
  // not via OpenRouter's `plugins: [{id:'web'}]`.
  web_search?: boolean;
}

export interface BuildLLMGatewayExtraBodyInput {
  reasoningEffort?: ReasoningEffort;
  search?: boolean;
  supportsWebSearch: boolean;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

/**
 * Maps SDK `reasoningEffort` to LLM Gateway's `reasoning` config without
 * per-model metadata. Returns `undefined` when no reasoning key should be sent —
 * the gateway uses the model's own default in that case (rather than rejecting
 * `effort: 'none'` on models that mandate reasoning, e.g. gpt-5-nano).
 */
export function mapReasoningToLLMGateway(
  effort: ReasoningEffort | undefined
): LLMGatewayReasoningConfig | undefined {
  return genericGatewayReasoning(effort);
}

/**
 * Maps SDK `search` boolean to LLM Gateway's `web_search` flag.
 * Returns `undefined` when search is not requested or the model doesn't
 * support search (so the field is omitted entirely).
 */
export function mapSearchToLLMGateway(
  search: boolean | undefined,
  supportsWebSearch: boolean
): boolean | undefined {
  if (search !== true || !supportsWebSearch) {
    return undefined;
  }
  return true;
}

/**
 * Builds the merged extra body for an LLM Gateway request. Returns `{}` if no
 * features are requested — the fetch wrapper is still created for unconditional
 * `delta.reasoning` cleanup.
 *
 * Reasoning is resolved from the provider's policy in reasoningConfig.json when
 * `provider` is supplied.
 */
export function buildLLMGatewayExtraBody(
  input: BuildLLMGatewayExtraBodyInput
): LLMGatewayExtraBody {
  const reasoning = genericGatewayReasoning(input.reasoningEffort);
  const webSearch = mapSearchToLLMGateway(
    input.search,
    input.supportsWebSearch
  );

  const extra: LLMGatewayExtraBody = {};
  if (reasoning !== undefined) {
    extra.reasoning = reasoning;
  }
  if (webSearch !== undefined) {
    extra.web_search = webSearch;
  }
  return extra;
}
