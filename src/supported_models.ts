import axios from "axios";

interface ProviderInfo {
  icon: string;
  models: string[];
  api_key: string;
  capabilities?: Record<string, string[]>; // New property that replaces support_media_inputs and support_web_search
  support_tools?: string[];
  support_response_model?: string[];
  openrouter_identifier?: Record<string, string>;
  price: Record<string, Record<string, number>>;
  name?: Record<string, string>;
  availableForChatApp: Record<string, string>;
  descriptions: Record<string, string>;
  model_prefix?: Record<string, string>;
  // Removed support_media_inputs and support_web_search properties
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

  // Workaround: OpenAI models that support PDFs even if not listed in capabilities
  // OpenAI announced PDF support for gpt-4o, gpt-4o-mini, and o1 series
  const openaiPdfSupportedModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4o-2024-08-06',
    'gpt-4o-2024-11-20',
    'chatgpt-4o-latest',
    'o1',
    'o1-mini',
    'o1-preview',
    'o1-2024-12-17'
  ];

  // Updated to use capabilities
  const modelCapabilities = PROVIDERS[provider]?.capabilities?.[model];
  if (!modelCapabilities) return false;

  // Only check for "image" and "pdf" capabilities
  return medias.every((media) => {
    // Only allow "image" and "pdf" media types
    if (media !== "image" && media !== "pdf") return false;

    // Special handling for OpenAI PDF support
    if (
      media === "pdf" &&
      provider === "openai" &&
      openaiPdfSupportedModels.includes(model)
    ) {
      return true;
    }

    return modelCapabilities.includes(media);
  });
}
export function doesModelSupportWebSearch(
  provider: string,
  model: string
): boolean {
  // Updated to use capabilities
  const modelCapabilities = PROVIDERS[provider]?.capabilities?.[model];
  if (!modelCapabilities) return false;
  return modelCapabilities.includes("search");
}
export function providerApiKeyName(provider: string) {
  return PROVIDERS[provider]?.api_key;
}

export function doesModelSupportReasoning(provider: string, model: string): boolean {
  const modelCapabilities = PROVIDERS[provider]?.capabilities?.[model];
  if (!modelCapabilities) return false;
  return modelCapabilities.includes("reasoning");
}

export function getModelPrefix(provider: string, model: string): string | null {
  const modelPrefixes = PROVIDERS[provider]?.model_prefix;
  if (!modelPrefixes) return null;

  return modelPrefixes[model] || null;
}