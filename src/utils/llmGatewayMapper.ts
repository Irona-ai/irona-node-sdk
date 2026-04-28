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
  tools?: Array<{ type: string }>;
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
 * Maps SDK reasoningEffort to LLMGateway's `reasoning` config.
 * Returns `undefined` when no reasoning key should be sent.
 */
export function mapReasoningToLLMGateway(
  effort: ReasoningEffort | undefined
): LLMGatewayReasoningConfig | undefined {
  // 'off' and undefined both mean "don't send a reasoning field" so that models
  // which mandate reasoning (e.g. gpt-5-nano, gemini-2.5-flash) use their own
  // default instead of rejecting a { effort: 'none' } payload.
  if (effort === undefined || effort === 'off') {
    return undefined;
  }
  return REASONING_EFFORT_MAP[effort];
}

/**
 * Maps SDK `search` boolean to LLMGateway's web_search tool format.
 * Returns `undefined` when search is not requested or unsupported.
 */
export function mapSearchToLLMGateway(
  search: boolean | undefined,
  supportsWebSearch: boolean
): Array<{ type: string }> | undefined {
  if (search !== true || !supportsWebSearch) {
    return undefined;
  }
  return [{ type: 'web_search' }];
}

/**
 * Builds the merged extra body for an LLMGateway request.
 */
export function buildLLMGatewayExtraBody(
  input: BuildLLMGatewayExtraBodyInput
): LLMGatewayExtraBody {
  const reasoning = mapReasoningToLLMGateway(input.reasoningEffort);
  const searchTools = mapSearchToLLMGateway(
    input.search,
    input.supportsWebSearch
  );

  const extra: LLMGatewayExtraBody = {};
  if (reasoning !== undefined) {
    extra.reasoning = reasoning;
  }
  if (searchTools !== undefined) {
    extra.tools = searchTools;
  }
  return extra;
}
