export const DEFAULT_BASE_URL = 'https://irona-ai--model-select.modal.run';
export const SUPPORTED_MODELS_DEFAULT_URL =
  'https://raw.githubusercontent.com/Irona-ai/llm-pricing-info/refs/heads/main/model_pricing.json';
export const IRONAAI_API_KEY_PREFIX = 'sk_';

export const TRAIN_ENDPOINT =
  process.env.CUSTOM_ROUTER_TRAIN_ENDPOINT ??
  'https://irona-ai--train.modal.run';
export const TASK_STATUS_ENDPOINT =
  process.env.CUSTOM_ROUTER_TASK_STATUS_ENDPOINT ??
  'https://irona-ai--taskstatus.modal.run';
export const MODELS_ENDPOINT =
  process.env.CUSTOM_ROUTER_MODELS_ENDPOINT ??
  'https://irona-ai--models.modal.run';
export const INFER_ENDPOINT =
  process.env.CUSTOM_ROUTER_INFER_ENDPOINT ??
  'https://irona-ai--infer.modal.run';

export const OPTIMIZE_ENDPOINT =
  process.env.OPTIMIZE_ENDPOINT ?? 'https://irona-ai--optimize.modal.run';
export const OPTIMIZE_STATUS_ENDPOINT =
  process.env.OPTIMIZE_STATUS_ENDPOINT ??
  'https://irona-ai--optimize-status.modal.run';
export const OPTIMIZE_RESULT_ENDPOINT =
  process.env.OPTIMIZE_RESULT_ENDPOINT ??
  'https://irona-ai--optimize-result.modal.run';
