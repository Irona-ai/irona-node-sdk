import {
  API_KEY_ENV_VAR,
  LEGACY_API_KEY_ENV_VARS,
  resolveApiKeyFromEnv,
} from '../../../src/utils/apiKeyEnv';

describe('resolveApiKeyFromEnv', () => {
  it('uses INFERENCELAB_API_KEY as the primary name', () => {
    expect(API_KEY_ENV_VAR).toBe('INFERENCELAB_API_KEY');
  });

  it('keeps the legacy names as fallbacks in the existing order', () => {
    expect(LEGACY_API_KEY_ENV_VARS).toEqual([
      'IRONLABS_API_KEY',
      'IRONLABS_AI_API_KEY',
      'IRONAAI_API_KEY',
    ]);
  });

  it('returns an empty key when nothing is set', () => {
    expect(resolveApiKeyFromEnv({})).toEqual({ apiKey: '' });
  });

  it('prefers INFERENCELAB_API_KEY over every legacy name', () => {
    expect(
      resolveApiKeyFromEnv({
        INFERENCELAB_API_KEY: 'sk_new',
        IRONLABS_API_KEY: 'sk_old1',
        IRONLABS_AI_API_KEY: 'sk_old2',
        IRONAAI_API_KEY: 'sk_old3',
      })
    ).toEqual({ apiKey: 'sk_new', source: 'INFERENCELAB_API_KEY' });
  });

  it.each([
    ['IRONLABS_API_KEY', { IRONLABS_API_KEY: 'sk_a' }],
    ['IRONLABS_AI_API_KEY', { IRONLABS_AI_API_KEY: 'sk_a' }],
    ['IRONAAI_API_KEY', { IRONAAI_API_KEY: 'sk_a' }],
  ])('falls back to %s when it is the only one set', (name, env) => {
    expect(resolveApiKeyFromEnv(env)).toEqual({ apiKey: 'sk_a', source: name });
  });

  it('follows IRONLABS_API_KEY > IRONLABS_AI_API_KEY > IRONAAI_API_KEY', () => {
    expect(
      resolveApiKeyFromEnv({
        IRONLABS_AI_API_KEY: 'sk_mid',
        IRONAAI_API_KEY: 'sk_last',
      }).apiKey
    ).toBe('sk_mid');
    expect(
      resolveApiKeyFromEnv({
        IRONLABS_API_KEY: 'sk_first',
        IRONLABS_AI_API_KEY: 'sk_mid',
        IRONAAI_API_KEY: 'sk_last',
      }).apiKey
    ).toBe('sk_first');
  });

  it('treats an empty INFERENCELAB_API_KEY as unset', () => {
    expect(
      resolveApiKeyFromEnv({
        INFERENCELAB_API_KEY: '',
        IRONAAI_API_KEY: 'sk_old',
      })
    ).toEqual({ apiKey: 'sk_old', source: 'IRONAAI_API_KEY' });
  });
});
