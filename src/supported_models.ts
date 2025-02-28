import axios from "axios";

interface ProviderInfo {
  models: string[];
  api_key: string;
  support_tools?: string[];
  support_response_model?: string[];
  openrouter_identifier?: Record<string, string>;
  model_prefix?: Record<string, string>;
  price: Record<string, Record<string, number>>;
  name?: Record<string, string>;
}

const SUPPORTED_MODELS_DEFAULT_URL =
  "https://gist.githubusercontent.com/tshrjn/f55b3ebd90eda8a0e65bf8435419edff/raw/supported_models_pricing.json";

let PROVIDERS: Record<string, ProviderInfo> = {};

export async function updateProvidersFromGist() {
  const SUPPORTED_MODELS_GIST_URL =
    process.env.SUPPORTED_MODELS_URL ?? SUPPORTED_MODELS_DEFAULT_URL;
  try {
    const response = await axios.get(SUPPORTED_MODELS_GIST_URL);
    console.log(
      `Supported Models URLs: Default - ${SUPPORTED_MODELS_DEFAULT_URL}, Environment - ${process.env.SUPPORTED_MODELS_URL}, Used - ${SUPPORTED_MODELS_GIST_URL}`
    );
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
  return PROVIDERS[provider]?.api_key;
}
