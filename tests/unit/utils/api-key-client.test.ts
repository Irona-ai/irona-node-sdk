jest.mock('../../../src/supported_models', () => ({
  updateProvidersFromGist: jest.fn().mockResolvedValue(undefined),
  doesModelSupportMediaTypes: jest.fn().mockReturnValue(true),
  doesModelSupportWebSearch: jest.fn().mockReturnValue(false),
  getOpenRouterIdentifier: jest.fn(),
  providerApiKeyName: jest.fn().mockReturnValue('API_KEY'),
}));
jest.mock('../../../src/utils/gatewayReasoning', () => ({
  updateGatewayReasoningConfig: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { MissingApiKeyError } from '../../../src/errors';
import { IronLabs } from '../../../src/index';
import { logger } from '../../../src/utils/logger';

const KEY_VARS = [
  'INFERENCELAB_API_KEY',
  'IRONLABS_API_KEY',
  'IRONLABS_AI_API_KEY',
  'IRONAAI_API_KEY',
];

describe('IronLabs API key environment variables', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of KEY_VARS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    (logger.warn as jest.Mock).mockClear();
  });

  afterEach(() => {
    for (const name of KEY_VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('accepts INFERENCELAB_API_KEY with no deprecation warning', async () => {
    process.env.INFERENCELAB_API_KEY = 'sk_new_key';
    await expect(IronLabs.createInstance()).resolves.toBeDefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('INFERENCELAB_API_KEY wins over every legacy name', async () => {
    process.env.INFERENCELAB_API_KEY = 'sk_new_key';
    // A legacy value without the sk_ prefix would throw if it were picked.
    process.env.IRONLABS_API_KEY = 'bad_legacy';
    process.env.IRONLABS_AI_API_KEY = 'bad_legacy';
    process.env.IRONAAI_API_KEY = 'bad_legacy';
    await expect(IronLabs.createInstance()).resolves.toBeDefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each(['IRONLABS_API_KEY', 'IRONLABS_AI_API_KEY', 'IRONAAI_API_KEY'])(
    'still works with only %s and warns to use INFERENCELAB_API_KEY',
    async name => {
      process.env[name] = 'sk_legacy_key';
      await expect(IronLabs.createInstance()).resolves.toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('INFERENCELAB_API_KEY')
      );
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(name));
    }
  );

  it('falls back to a legacy name when INFERENCELAB_API_KEY is empty', async () => {
    process.env.INFERENCELAB_API_KEY = '';
    process.env.IRONAAI_API_KEY = 'sk_legacy_key';
    await expect(IronLabs.createInstance()).resolves.toBeDefined();
  });

  it('config.apiKey works without any env var and does not warn', async () => {
    process.env.IRONAAI_API_KEY = 'sk_legacy_key';
    await expect(
      IronLabs.createInstance({ apiKey: 'sk_from_config' })
    ).resolves.toBeDefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('the missing-key error names INFERENCELAB_API_KEY', async () => {
    const err = await IronLabs.createInstance().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MissingApiKeyError);
    expect((err as Error).message).toContain('INFERENCELAB_API_KEY');
    expect((err as Error).message).not.toContain('IRONLABS_API_KEY');
  });
});
