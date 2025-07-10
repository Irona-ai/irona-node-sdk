import axios from "axios";

interface ProviderInfo {
  icon: string;
  models: string[];
  api_key: string;
  support_media_inputs?: Record<string, string[]>;
  support_tools?: string[];
  support_response_model?: string[];
  openrouter_identifier?: Record<string, string>;
  price: Record<string, Record<string, number>>;
  name?: Record<string, string>;
  availableForChatApp: Record<string, string>;
  descriptions: Record<string, string>;
  model_prefix?: Record<string, string>;
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
  const supportedInputs = PROVIDERS[provider]?.support_media_inputs?.[model];
  if (!supportedInputs) return false;
  return medias.every((media) => supportedInputs.includes(media));
}
export function providerApiKeyName(provider: string) {
  return PROVIDERS[provider]?.api_key;
}
