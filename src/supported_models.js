"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProvidersFromGist = updateProvidersFromGist;
exports.isSupportedModel = isSupportedModel;
exports.doesModelSupportMediaTypes = doesModelSupportMediaTypes;
exports.doesModelSupportWebSearch = doesModelSupportWebSearch;
exports.doesModelSupportImageGeneration = doesModelSupportImageGeneration;
exports.providerApiKeyName = providerApiKeyName;
const axios_1 = __importDefault(require("axios"));
let PROVIDERS = {};
async function updateProvidersFromGist(SUPPORTED_MODELS_GIST_URL) {
    try {
        const response = await axios_1.default.get(SUPPORTED_MODELS_GIST_URL);
        const data = response.data;
        PROVIDERS = typeof data === "string" ? JSON.parse(data) : data;
        console.info("Supported Models details loaded from Gist.");
    }
    catch (error) {
        console.error("Failed to load Supported Models details from Gist.");
        throw error;
    }
}
function isSupportedModel(provider, model) {
    return PROVIDERS[provider]?.models.includes(model) ?? false;
}
function doesModelSupportMediaTypes(provider, model, medias) {
    if (!medias || medias.length === 0)
        return true;
    const supportedInputs = PROVIDERS[provider]?.capabilities?.[model];
    if (!supportedInputs)
        return false;
    return medias.every((media) => supportedInputs.includes(media));
}
function doesModelSupportWebSearch(provider, model) {
    const supportedSearchModels = PROVIDERS[provider]?.capabilities?.[model];
    if (!supportedSearchModels)
        return false;
    return supportedSearchModels.includes("search");
}
function doesModelSupportImageGeneration(provider, model) {
    const capabilities = PROVIDERS[provider]?.capabilities?.[model];
    if (!capabilities)
        return false;
    return capabilities.includes("image-gen");
}
function providerApiKeyName(provider) {
    // Special handling for Vertex which has multiple API keys
    if (provider === "vertex") {
        return PROVIDERS[provider]?.vertex_api_keys || null;
    }
    return PROVIDERS[provider]?.api_key;
}
