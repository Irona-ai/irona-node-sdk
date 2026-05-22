import { MissingApiKeyError } from '../errors';

import { IRONAAI_API_KEY_PREFIX } from './constants';

export function validateApiKey(apiKey: string): void {
  if (apiKey === '') {
    throw new MissingApiKeyError(
      "The API key is missing. Please provide the API key either through the 'IRONAAI_API_KEY' environment variable or the 'config.apiKey' property."
    );
  }
  if (!apiKey.startsWith(IRONAAI_API_KEY_PREFIX)) {
    throw new MissingApiKeyError(
      "The provided API key is invalid. Please generate a new key at 'https://app.irona.ai/dashboard/api-keys'."
    );
  }
}
