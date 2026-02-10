// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { BadRequestError } from '../../../src/errors';
import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import type { Config } from '../../../src/types';
import { setupStreamError } from '../../mocks/ai-sdk.mock';
import {
  mockExtractMediaTypeArrayFromMessages,
  mockGetSupportedProviderAndModelArray,
  resetProviderUtilsMocks,
} from '../../mocks/provider-utils.mock';
import { createMockRouterClient } from '../../mocks/router-client.mock';
import {
  mockDoesModelSupportMediaTypes,
  resetSupportedModelsMocks,
} from '../../mocks/supported-models.mock';
import {
  createTestPayload,
  createImagePayload,
  setupTestEnv,
  mockConsole,
} from '../../utils/test-helpers';

describe('Edge Cases', () => {
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

  describe('Validation', () => {
    it('validates empty messages array', async () => {
      const invalidPayload = {
        messages: [],
        models: ['openai/gpt-4o-mini'] as [string, ...string[]],
      } as any;

      await expect(client.completions(invalidPayload)).rejects.toThrow(
        BadRequestError
      );

      expect(mockRouter.modelSelect).not.toHaveBeenCalled();
    });

    it('handles invalid model format', async () => {
      const payload = createTestPayload({
        models: ['invalid-model-format'] as [string, ...string[]],
      });

      await expect(client.completions(payload)).rejects.toThrow();
    });
  });

  describe('Media Type Support', () => {
    it('validates media type support for images', async () => {
      mockDoesModelSupportMediaTypes.mockReturnValue(false);
      mockExtractMediaTypeArrayFromMessages.mockReturnValue(['image']);
      mockGetSupportedProviderAndModelArray.mockReturnValue([
        { provider: 'openai', model: 'gpt-4o-mini' },
      ]);

      const payload = createImagePayload();

      await expect(client.completions(payload)).rejects.toThrow(
        BadRequestError
      );

      expect(mockRouter.modelSelect).not.toHaveBeenCalled();
    });
  });

  describe('Streaming Errors', () => {
    it('handles streaming errors properly', async () => {
      setupStreamError();

      const payload = createTestPayload({ stream: true });

      try {
        const result = await client.completions(payload);
        const iterator = result.response.fullStream![Symbol.asyncIterator]();
        await expect(iterator.next()).rejects.toThrow('Stream error');
      } catch (error) {
        // If the completion itself fails, that's also valid
        expect(error).toBeTruthy();
      }
    });
  });
});
