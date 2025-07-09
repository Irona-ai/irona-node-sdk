import axios from "axios";

interface ProviderInfo {
  models: string[];
  api_key: string;
  bedrock_api_keys?: Record<string, string>;// Add this for Bedrock
  support_tools?: string[];
  support_response_model?: string[];
  openrouter_identifier?: Record<string, string>;
  model_prefix?: Record<string, string>;
  price: Record<string, Record<string, number>>;
  name?: Record<string, string>;
  support_web_search?: string[];
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
export function providerApiKeyName(provider: string) {
  // Special handling for Bedrock which has multiple API keys
  if (provider === "bedrock") {
    return PROVIDERS[provider]?.bedrock_api_keys || null
  }
  return PROVIDERS[provider]?.api_key;
}

export function doesModelSupportWebSearch(
  provider: string,
  model: string
): boolean {
  const supportedModels = PROVIDERS[provider]?.support_web_search;
  if (!supportedModels) return false;
  return supportedModels.includes(model);
}