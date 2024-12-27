import { isSupportedModel } from "../supported_models";
import { UnsupportedModelError } from "../errors";
import { ModelPayload } from "../validators/common.validators";

export function validateAndGetProviderAndModel(modelPayload: ModelPayload) {
  const [provider, ...modelParts] = modelPayload.toLowerCase().split("/");
  const model = modelParts.join("/");
  if (!isSupportedModel(provider, model)) {
    throw new UnsupportedModelError(`${provider}/${model} is not supported.`);
  }
  return { provider, model };
}
