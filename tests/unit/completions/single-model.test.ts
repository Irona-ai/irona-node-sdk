// Import mocks before anything else
import '../../mocks/ai-sdk.mock';

import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import type { Config } from '../../../src/types';
import {
  mockGenerateText,
  mockStreamText,
  setupSuccessfulGeneration,
  setupSuccessfulStream,
} from '../../mocks/ai-sdk.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';
import { createMockRouterClient } from '../../mocks/router-client.mock';
import { resetSupportedModelsMocks } from '../../mocks/supported-models.mock';
import {
  createTestPayload,
  setupTestEnv,
  mockConsole,
} from '../../utils/test-helpers';

describe('Single Model Completions', () => {
  let client: IronaChatClient;
  let mockRouter: ReturnType<typeof createMockRouterClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSupportedModelsMocks();
    resetProviderUtilsMocks();
    setupTestEnv();
    mockConsole();

    mockRouter = createMockRouterClient();
    const config: Config = { apiKey: 'test-api-key' };
    client = new IronaChatClient(config, mockRouter);
  });

  describe('Router Bypass', () => {
    it('skips router when single model provided', async () => {
      setupSuccessfulGeneration('Hello! How can I help you?');

      const result = await client.completions(createTestPayload());

      expect(mockRouter.modelSelect).not.toHaveBeenCalled();
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o-mini');
      expect(result.response.content).toBe('Hello! How can I help you?');
    });

    it('works with different providers', async () => {
      setupSuccessfulGeneration('Hello from Claude!');

      const payload = createTestPayload({
        models: ['anthropic/claude-3-haiku-20240307'] as [string, ...string[]],
      });

      const result = await client.completions(payload);

      expect(mockRouter.modelSelect).not.toHaveBeenCalled();
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-haiku-20240307');
    });
  });

  describe('Parameters', () => {
    it('passes temperature and maxTokens correctly', async () => {
      setupSuccessfulGeneration();

      const payload = createTestPayload({
        temperature: 0.7,
        maxTokens: 100,
      });

      await client.completions(payload);

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 100,
        })
      );
    });
  });

  describe('Streaming', () => {
    it('handles streaming for single model', async () => {
      setupSuccessfulStream();

      const payload = createTestPayload({ stream: true });
      const result = await client.completions(payload);

      expect(mockRouter.modelSelect).not.toHaveBeenCalled();
      expect(mockStreamText).toHaveBeenCalled();
      expect(result.response.fullStream).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('throws error when API key is missing', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(client.completions(createTestPayload())).rejects.toThrow(
        /All attempts to process the completions request failed/
      );

      expect(mockRouter.modelSelect).not.toHaveBeenCalled();
    });
  });
});
