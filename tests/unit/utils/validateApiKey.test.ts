import { MissingApiKeyError } from '../../../src/errors';
import { validateApiKey } from '../../../src/utils/validateApiKey';

describe('validateApiKey', () => {
  it('accepts valid key starting with sk_', () => {
    expect(() => validateApiKey('sk_abc123')).not.toThrow();
  });

  it('throws MissingApiKeyError for empty string', () => {
    expect(() => validateApiKey('')).toThrow(MissingApiKeyError);
  });

  it('throws MissingApiKeyError for key missing sk_ prefix', () => {
    expect(() => validateApiKey('invalid_key')).toThrow(MissingApiKeyError);
  });

  it('throws MissingApiKeyError for key with wrong prefix', () => {
    expect(() => validateApiKey('pk_abc123')).toThrow(MissingApiKeyError);
  });

  it('missing key error message references env var', () => {
    expect(() => validateApiKey('')).toThrow('IRONAAI_API_KEY');
  });

  it('invalid prefix error message references dashboard URL', () => {
    expect(() => validateApiKey('bad_key')).toThrow('https://app.irona.ai');
  });
});
