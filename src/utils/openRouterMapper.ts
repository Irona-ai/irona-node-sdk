import type { ReasoningEffort } from './reasoningConfig';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OpenRouterReasoningConfig {
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'none';
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

export interface OpenRouterSearchConfig {
  plugins: Array<{ id: string }>;
  web_search_options: { search_context_size: 'low' | 'medium' | 'high' };
}

export interface OpenRouterExtraBody {
  reasoning?: OpenRouterReasoningConfig;
  plugins?: Array<{ id: string }>;
  web_search_options?: { search_context_size: string };
}

export interface BuildOpenRouterExtraBodyInput {
  reasoningEffort?: ReasoningEffort;
  search?: boolean;
  supportsWebSearch: boolean;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

const REASONING_EFFORT_MAP: Record<
  string,
  OpenRouterReasoningConfig | undefined
> = {
  off: { enabled: false },
  low: { effort: 'low' },
  medium: { effort: 'medium' },
  high: { effort: 'high' },
  max: { effort: 'xhigh' },
};

/**
 * Maps SDK reasoning_effort to OpenRouter's `reasoning` config.
 * Returns `undefined` when no reasoning key should be sent.
 */
export function mapReasoningToOpenRouter(
  effort: ReasoningEffort | undefined
): OpenRouterReasoningConfig | undefined {
  if (effort === undefined) {
    return undefined;
  }
  return REASONING_EFFORT_MAP[effort];
}

/**
 * Maps SDK `search` boolean to OpenRouter's plugin + web_search_options format.
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
    web_search_options: { search_context_size: 'medium' },
  };
}

/**
 * Builds the merged extra body for an OpenRouter request.
 * Returns `undefined` when no extra params are needed (avoids unnecessary fetch wrapper).
 */
export function buildOpenRouterExtraBody(
  input: BuildOpenRouterExtraBodyInput
): OpenRouterExtraBody | undefined {
  const reasoning = mapReasoningToOpenRouter(input.reasoningEffort);
  const search = mapSearchToOpenRouter(input.search, input.supportsWebSearch);

  if (reasoning === undefined && search === undefined) {
    return undefined;
  }

  const extra: OpenRouterExtraBody = {};
  if (reasoning !== undefined) {
    extra.reasoning = reasoning;
  }
  if (search !== undefined) {
    extra.plugins = search.plugins;
    extra.web_search_options = search.web_search_options;
  }
  return extra;
}
