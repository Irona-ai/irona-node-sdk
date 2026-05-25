import type { ReasoningEffort } from './reasoningConfig';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LLMGatewayReasoningConfig {
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'none';
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

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

const REASONING_EFFORT_MAP: Record<
  string,
  LLMGatewayReasoningConfig | undefined
> = {
  off: { effort: 'none' },
  low: { effort: 'low' },
  medium: { effort: 'medium' },
  high: { effort: 'high' },
  max: { effort: 'xhigh' },
};

/**
 * Maps SDK `reasoningEffort` to LLM Gateway's `reasoning` config.
 * Returns `undefined` when no reasoning key should be sent — the gateway uses
 * the model's own default in that case (rather than rejecting `effort: 'none'`
 * on models that mandate reasoning, e.g. gpt-5-nano).
 */
export function mapReasoningToLLMGateway(
  effort: ReasoningEffort | undefined
): LLMGatewayReasoningConfig | undefined {
  if (effort === undefined || effort === 'off') {
    return undefined;
  }
  return REASONING_EFFORT_MAP[effort];
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
 */
export function buildLLMGatewayExtraBody(
  input: BuildLLMGatewayExtraBodyInput
): LLMGatewayExtraBody {
  const reasoning = mapReasoningToLLMGateway(input.reasoningEffort);
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
