import type { ModelSelectPayload } from '../schemas/modelSelect.schema';

/**
 * Resolves the requested number of models (top-k) from a model-select payload,
 * accepting both the canonical camelCase `topkModels` and the snake_case
 * `topk_models` alias that some callers (e.g. the chat backend) send.
 *
 * camelCase takes precedence when both are present.
 */
export function getTopKModels(
  body: Pick<ModelSelectPayload, 'topkModels' | 'topk_models'>
): number | undefined {
  return body?.topkModels ?? body?.topk_models;
}
