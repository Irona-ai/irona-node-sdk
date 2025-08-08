// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import { Config } from '../../../src/types';
import { setupSuccessfulGeneration, mockGenerateText } from '../../mocks/ai-sdk.mock';
import { 
  createMockRouterClient, 
  setupRouterSuccess, 
  setupRouterError,
  setupRouterNetworkError 
} from '../../mocks/router-client.mock';
import { createMultiModelPayload, setupTestEnv, mockConsole } from '../../utils/test-helpers';
import { resetSupportedModelsMocks } from '../../mocks/supported-models.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';

describe('Multi-Model Completions', () => {
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

  describe('Router Integration', () => {
    it('calls router when multiple models provided', async () => {
      setupRouterSuccess(mockRouter);
      setupSuccessfulGeneration('Router selected response');

      const result = await client.completions(createMultiModelPayload());

      expect(mockRouter.modelSelect).toHaveBeenCalledWith({
        messages: expect.any(Array),
        models: expect.arrayContaining(['openai/gpt-4o-mini', 'anthropic/claude-3-haiku-20240307']),
      });
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o-mini');
    });

    it('uses fallback when router returns error', async () => {
      setupRouterError(mockRouter);
      setupSuccessfulGeneration('Fallback response');

      const payload = createMultiModelPayload({
        fallback_models: ['openai/gpt-4o-mini'] as [string, ...string[]],
      });

      const result = await client.completions(payload);

      expect(mockRouter.modelSelect).toHaveBeenCalled();
      expect(result.response.content).toBe('Fallback response');
    });

    it('handles router network errors gracefully', async () => {
      setupRouterNetworkError(mockRouter);
      setupSuccessfulGeneration('Fallback response');

      const payload = createMultiModelPayload({
        fallback_models: ['openai/gpt-4o-mini'] as [string, ...string[]],
      });

      const result = await client.completions(payload);

      expect(mockRouter.modelSelect).toHaveBeenCalled();
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o-mini');
    });
  });

  describe('Retry Logic', () => {
    it('retries with fallback models when primary fails', async () => {
      setupRouterSuccess(mockRouter, 'openai', 'gpt-4o');
      
      mockGenerateText
        .mockRejectedValueOnce(new Error('Primary model failed'))
        .mockResolvedValueOnce({ text: 'Fallback success' });

      const payload = createMultiModelPayload({
        fallback_models: ['anthropic/claude-3-haiku-20240307'] as [string, ...string[]],
      });

      const result = await client.completions(payload);

      expect(mockGenerateText).toHaveBeenCalledTimes(2);
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-haiku-20240307');
    });

    it('throws error when all models fail', async () => {
      setupRouterSuccess(mockRouter, 'openai', 'gpt-4o');
      mockGenerateText.mockRejectedValue(new Error('All models failed'));

      const payload = createMultiModelPayload({
        fallback_models: ['openai/gpt-4o-mini'] as [string, ...string[]],
      });

      await expect(
        client.completions(payload)
      ).rejects.toThrow('All attempts to process the completions request failed');
    });
  });
});