import { UnsupportedModelError } from '../errors';
import type { MessagePayload, ModelPayload } from '../schemas/common.schema';
import { isSupportedModel } from '../supported_models';

import { logger } from './logger';

/**
 * Validates a model string in provider/model format and splits it into provider and model parts
 * @param modelPayload - The model string in format "provider/model"
 * @returns Object containing separated provider and model strings
 * @throws {UnsupportedModelError} If the provider/model combination is not supported
 */
export function validateAndGetProviderAndModel(modelPayload: ModelPayload) {
  const [provider, ...modelParts] = modelPayload.split('/');
  const model = modelParts.join('/');
  if (!isSupportedModel(provider, model)) {
    throw new UnsupportedModelError(`${provider}/${model} is not supported.`);
  }
  return { provider, model };
}

export function extractMediaTypeArrayFromMessages(
  messages: MessagePayload[]
): string[] {
  const mediaTypes: Set<string> = new Set();

  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item.type === 'image' || item.type === 'image_url') {
          mediaTypes.add('image');
        }
        if (item.type === 'file' || item.type === 'document') {
          mediaTypes.add('pdf');
        }
      }
    }
  }

  return Array.from(mediaTypes);
}

export function getSupportedProviderAndModelArray(
  models: ModelPayload[]
): { provider: string; model: string }[] {
  return models
    .map(model => {
      try {
        return validateAndGetProviderAndModel(model);
      } catch (error) {
        // If validation fails for some models, still continue with valid ones
        logger.error(
          `Error validating model ${model}: ${(error as Error).message}`
        );
        return null;
      }
    })
    .filter(provider => provider !== null);
}
