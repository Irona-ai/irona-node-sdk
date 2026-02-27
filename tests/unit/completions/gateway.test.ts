// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import type { Config } from '../../../src/types';
import {
  mockGenerateText,
  setupSuccessfulGeneration,
} from '../../mocks/ai-sdk.mock';
import {
  mockDoesModelSupportWebSearch,
  mockGetOpenRouterIdentifier,
  resetSupportedModelsMocks,
} from '../../mocks/supported-models.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';
import { createMockRouterClient } from '../../mocks/router-client.mock';
import {
  createTestPayload,
  mockConsole,
  setupTestEnv,
} from '../../utils/test-helpers';
import * as openRouterMapper from '../../../src/utils/openRouterMapper';
import * as openRouterFetchWrapper from '../../../src/utils/openRouterFetchWrapper';

describe('Gateway Completions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSupportedModelsMocks();
    resetProviderUtilsMocks();
    setupTestEnv();
    mockConsole();
  });

  it('uses gateway API key and does not require provider API keys', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'openrouter-test-key',
      },
    };
    const client = new IronaChatClient(config, mockRouter);

    delete process.env.OPENAI_API_KEY;
    setupSuccessfulGeneration('Gateway response');

    const result = await client.completions(createTestPayload());

    expect(result.response.content).toBe('Gateway response');
    expect(mockRouter.modelSelect).not.toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it('uses OpenRouter model mapping when available and no provider key is set', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'openrouter-test-key',
      },
    };
    const client = new IronaChatClient(config, mockRouter);

    // Delete direct provider key so google routes through gateway
    delete process.env.GOOGLE_API_KEY;
    mockGetOpenRouterIdentifier.mockReturnValue('google/gemini-2.0-flash-001');
    setupSuccessfulGeneration('Mapped response');

    await client.completions(
      createTestPayload({
        models: ['google/gemini-1.5-pro-latest'] as [string, ...string[]],
      })
    );

    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    expect(requestConfig.model.modelId).toBe('google/gemini-2.0-flash-001');
  });

  it('bypasses gateway for providers with direct API keys', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'openrouter-test-key',
      },
    };
    const client = new IronaChatClient(config, mockRouter);

    // GOOGLE_API_KEY is set by setupTestEnv() — google should bypass gateway
    mockGetOpenRouterIdentifier.mockReturnValue('google/gemini-2.0-flash-001');
    setupSuccessfulGeneration('Direct response');

    await client.completions(
      createTestPayload({
        models: ['google/gemini-1.5-pro-latest'] as [string, ...string[]],
      })
    );

    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    // Model name should be raw (direct), NOT the OpenRouter identifier
    expect(requestConfig.model.modelId).toBe('gemini-1.5-pro-latest');
  });

  it('bypasses gateway when programmatic providers config has apiKey', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'openrouter-test-key',
      },
      providers: {
        openai: { apiKey: 'programmatic-openai-key' },
      },
    };
    const client = new IronaChatClient(config, mockRouter);

    // Delete env var — programmatic config should still bypass gateway
    delete process.env.OPENAI_API_KEY;
    setupSuccessfulGeneration('Direct via programmatic config');

    const result = await client.completions(createTestPayload());

    expect(result.response.content).toBe('Direct via programmatic config');
    // Model name should be raw (direct), not gateway-prefixed
    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    expect(requestConfig.model.modelId).toBe('gpt-4o-mini');
  });

  it('supports gateways without provider-prefixed model names', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://llm-gateway.example.com/v1',
        apiKey: 'gateway-test-key',
        includeProviderInModelName: false,
      },
    };
    const client = new IronaChatClient(config, mockRouter);

    // Delete direct key so provider routes through gateway
    delete process.env.OPENAI_API_KEY;
    setupSuccessfulGeneration('No-prefix response');

    await client.completions(createTestPayload());

    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    expect(requestConfig.model.modelId).toBe('gpt-4o-mini');
  });

  describe('OpenRouter payload mapping', () => {
    let buildExtraBodySpy: jest.SpyInstance;
    let fetchWrapperSpy: jest.SpyInstance;

    beforeEach(() => {
      buildExtraBodySpy = jest.spyOn(
        openRouterMapper,
        'buildOpenRouterExtraBody'
      );
      fetchWrapperSpy = jest.spyOn(
        openRouterFetchWrapper,
        'createOpenRouterFetchWrapper'
      );
    });

    afterEach(() => {
      buildExtraBodySpy.mockRestore();
      fetchWrapperSpy.mockRestore();
    });

    it('sends reasoning params through OpenRouter gateway', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Reasoning response');

      await client.completions(createTestPayload({ reasoningEffort: 'high' }));

      expect(buildExtraBodySpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'high' })
      );
      // When extra body is returned, the fetch wrapper is created
      expect(fetchWrapperSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoning: { effort: 'high' } })
      );
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it('sends search params through OpenRouter gateway', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      mockDoesModelSupportWebSearch.mockReturnValue(true);
      setupSuccessfulGeneration('Search response');

      await client.completions(createTestPayload({ search: true }));

      expect(buildExtraBodySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          search: true,
          supportsWebSearch: true,
        })
      );
      expect(fetchWrapperSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: [{ id: 'web' }],
        })
      );
    });

    it('sends both reasoning and search through OpenRouter gateway', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      mockDoesModelSupportWebSearch.mockReturnValue(true);
      setupSuccessfulGeneration('Combined response');

      await client.completions(
        createTestPayload({ reasoningEffort: 'max', search: true })
      );

      expect(fetchWrapperSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: { effort: 'xhigh' },
          plugins: [{ id: 'web' }],
        })
      );
    });

    it('does not create fetch wrapper when no features are requested', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Plain response');

      await client.completions(createTestPayload());

      // buildOpenRouterExtraBody is called but returns undefined
      expect(buildExtraBodySpy).toHaveBeenCalled();
      expect(buildExtraBodySpy).toHaveReturnedWith(undefined);
      // Fetch wrapper should NOT be created
      expect(fetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('does not use OpenRouter mapping for non-OpenRouter gateways', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://llm-gateway.example.com/v1',
          apiKey: 'gateway-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Non-OpenRouter response');

      await client.completions(createTestPayload({ reasoningEffort: 'high' }));

      // buildOpenRouterExtraBody should NOT be called for non-OpenRouter gateways
      expect(buildExtraBodySpy).not.toHaveBeenCalled();
      expect(fetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('does not use OpenRouter mapping when provider has direct API key', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      // OPENAI_API_KEY is set by setupTestEnv() — should bypass gateway entirely
      setupSuccessfulGeneration('Direct response');

      await client.completions(createTestPayload());

      // When bypassing gateway, OpenRouter mapping is not used
      expect(buildExtraBodySpy).not.toHaveBeenCalled();
      expect(fetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('works with OpenRouter subdomain gateways', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.openrouter.ai/api/v1',
          apiKey: 'openrouter-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Subdomain response');

      await client.completions(
        createTestPayload({ reasoningEffort: 'medium' })
      );

      expect(buildExtraBodySpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'medium' })
      );
      expect(fetchWrapperSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoning: { effort: 'medium' } })
      );
    });
  });
});
