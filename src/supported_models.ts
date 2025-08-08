import axios from "axios";

interface ProviderInfo {
  icon: string;
  models: string[];
  api_key: string;
  vertex_api_keys: Record<string, string>;
  support_tools?: string[];
  support_response_model?: string[];
  openrouter_identifier?: Record<string, string>;
  price: Record<string, Record<string, number>>;
  name?: Record<string, string>;
  availableForChatApp: Record<string, string>;
  descriptions: Record<string, string>;
  model_prefix?: Record<string, string>;
  capabilities: Record<string, string[]>;
}

let PROVIDERS: Record<string, ProviderInfo> = {};

export async function updateProvidersFromGist(
  SUPPORTED_MODELS_GIST_URL: string
) {
  try {
    const response = await axios.get(SUPPORTED_MODELS_GIST_URL);
    const data = response.data;
    PROVIDERS = typeof data === "string" ? JSON.parse(data) : data;
    console.info("Supported Models details loaded from Gist.");
  } catch (error) {
    console.error("Failed to load Supported Models details from Gist.");
    throw error;
  }
}
export function isSupportedModel(provider: string, model: string) {
  return PROVIDERS[provider]?.models.includes(model) ?? false;
}
export function doesModelSupportMediaTypes(
  provider: string,
  model: string,
  medias: string[]
) {
  if (!medias || medias.length === 0) return true;
  const supportedInputs = PROVIDERS[provider]?.capabilities?.[model];
  if (!supportedInputs) return false;
  return medias.every((media) => supportedInputs.includes(media));
}
export function doesModelSupportWebSearch(
  provider: string,
  model: string
): boolean {
  const supportedSearchModels = PROVIDERS[provider]?.capabilities?.[model];
  if (!supportedSearchModels) return false;
  return supportedSearchModels.includes("search");
}
export function doesModelSupportImageGeneration(
  provider: string,
  model: string
): boolean {
  const capabilities = PROVIDERS[provider]?.capabilities?.[model];
  if (!capabilities) return false;
  return capabilities.includes("image-gen");
}
export function providerApiKeyName(provider: string) {
  // Special handling for Vertex which has multiple API keys
  if (provider === "vertex") {
    return PROVIDERS[provider]?.vertex_api_keys || null;
  }

  return PROVIDERS[provider]?.api_key;
}
