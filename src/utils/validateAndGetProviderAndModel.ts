import { isSupportedModel } from "../supported_models";
import { UnsupportedModelError } from "../errors";
import { ModelPayload } from "../validators/common.validators";

/**
 * Validates a model string in provider/model format and splits it into provider and model parts
 * @param modelPayload - The model string in format "provider/model" 
 * @returns Object containing separated provider and model strings
 * @throws {UnsupportedModelError} If the provider/model combination is not supported
 */
export function validateAndGetProviderAndModel(modelPayload: ModelPayload) {
  const [provider, ...modelParts] = modelPayload.split("/");
  const model = modelParts.join("/");
  if (!isSupportedModel(provider, model)) {
    throw new UnsupportedModelError(`${provider}/${model} is not supported.`);
  }
  return { provider, model };
}
