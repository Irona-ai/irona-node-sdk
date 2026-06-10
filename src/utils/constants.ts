export const DEFAULT_BASE_URL = 'https://irona-ai--model-select.modal.run';
export const SUPPORTED_MODELS_DEFAULT_URL =
  'https://raw.githubusercontent.com/Irona-ai/llm-pricing-info/refs/heads/main/model_pricing.json';
export const IRONLABS_AI_API_KEY_PREFIX = 'sk_';

// Default base URLs for each supported OpenAI-compatible gateway. Used both
// as the auto-resolved fallback when only an API key is set and as the
// source-of-truth for hostname detection in `gatewayType.ts`.
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
export const LLM_GATEWAY_DEFAULT_BASE_URL = 'https://api.llmgateway.io/v1';
