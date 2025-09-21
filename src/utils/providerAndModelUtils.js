"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAndGetProviderAndModel = validateAndGetProviderAndModel;
exports.extractMediaTypeArrayFromMessages = extractMediaTypeArrayFromMessages;
exports.getSupportedProviderAndModelArray = getSupportedProviderAndModelArray;
const supported_models_1 = require("../supported_models");
const errors_1 = require("../errors");
/**
 * Validates a model string in provider/model format and splits it into provider and model parts
 * @param modelPayload - The model string in format "provider/model"
 * @returns Object containing separated provider and model strings
 * @throws {UnsupportedModelError} If the provider/model combination is not supported
 */
function validateAndGetProviderAndModel(modelPayload) {
    const [provider, ...modelParts] = modelPayload.split("/");
    const model = modelParts.join("/");
    if (!(0, supported_models_1.isSupportedModel)(provider, model)) {
        throw new errors_1.UnsupportedModelError(`${provider}/${model} is not supported.`);
    }
    return { provider, model };
}
function extractMediaTypeArrayFromMessages(messages) {
    const mediaTypes = new Set();
    for (const message of messages) {
        if (Array.isArray(message.content)) {
            for (const item of message.content) {
                if (item.type === "image_url") {
                    mediaTypes.add("image");
                }
                if (item.type === "document") {
                    mediaTypes.add("pdf");
                }
            }
        }
    }
    return Array.from(mediaTypes);
}
function getSupportedProviderAndModelArray(models) {
    return models
        .map((model) => {
        try {
            return validateAndGetProviderAndModel(model);
        }
        catch (error) {
            // If validation fails for some models, still continue with valid ones
            console.error(`Error validating model ${model}: ${error.message}`);
            return null;
        }
    })
        .filter((provider) => provider !== null);
}
