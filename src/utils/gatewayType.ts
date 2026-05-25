import {
  LLM_GATEWAY_DEFAULT_BASE_URL,
  OPENROUTER_DEFAULT_BASE_URL,
} from './constants';

/**
 * The supported OpenAI-compatible gateway flavours. Each one has slightly
 * different request-body shapes for advanced features (reasoning, web search,
 * model naming) — see `openRouterMapper.ts` and `llmGatewayMapper.ts`.
 *
 * `'other'` covers any user-supplied OpenAI-compatible endpoint that we don't
 * recognise; those route through with no gateway-specific payload mapping.
 */
export type GatewayType = 'openrouter' | 'llmgateway' | 'other';

const OPENROUTER_HOSTNAME = new URL(
  OPENROUTER_DEFAULT_BASE_URL
).hostname.toLowerCase();
const LLM_GATEWAY_HOSTNAME = new URL(
  LLM_GATEWAY_DEFAULT_BASE_URL
).hostname.toLowerCase();

/**
 * Classifies a gateway by hostname. Accepts the canonical hostname, the bare
 * apex domain (e.g. `llmgateway.io`), and any subdomain.
 */
export function detectGatewayTypeFromHostname(
  hostname: string | undefined
): GatewayType {
  if (hostname === undefined || hostname === '') return 'other';
  const h = hostname.toLowerCase();
  if (h === OPENROUTER_HOSTNAME || h.endsWith('.openrouter.ai')) {
    return 'openrouter';
  }
  if (
    h === LLM_GATEWAY_HOSTNAME ||
    h === 'llmgateway.io' ||
    h.endsWith('.llmgateway.io')
  ) {
    return 'llmgateway';
  }
  return 'other';
}

/**
 * Classifies a gateway by base URL (delegates to hostname detection).
 * Returns `'other'` for malformed URLs or empty input.
 */
export function detectGatewayTypeFromUrl(
  baseUrl: string | undefined
): GatewayType {
  if (baseUrl === undefined || baseUrl === '') return 'other';
  try {
    return detectGatewayTypeFromHostname(new URL(baseUrl).hostname);
  } catch {
    return 'other';
  }
}
