/**
 * API key environment variable names, in lookup order.
 * `INFERENCELAB_API_KEY` is the name to set; the rest are legacy fallbacks.
 */
export const API_KEY_ENV_VAR = 'INFERENCELAB_API_KEY';
export const LEGACY_API_KEY_ENV_VARS = [
  'IRONLABS_API_KEY',
  'IRONLABS_AI_API_KEY',
  'IRONAAI_API_KEY',
] as const;

export interface ResolvedEnvApiKey {
  /** The key value, or '' when none of the env vars is set. */
  apiKey: string;
  /** Name of the env var the key came from, if any. */
  source?: string;
}

/** First non-empty value among INFERENCELAB_API_KEY and the legacy names. */
export function resolveApiKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ResolvedEnvApiKey {
  for (const name of [API_KEY_ENV_VAR, ...LEGACY_API_KEY_ENV_VARS]) {
    const value = env[name];
    if (value !== undefined && value !== '') {
      return { apiKey: value, source: name };
    }
  }
  return { apiKey: '' };
}
