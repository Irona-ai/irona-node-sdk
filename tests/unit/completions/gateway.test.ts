// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { IronlabsChatClient } from '../../../src/ironlabs-chat-client/IronlabsChatClient';
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
import {
  mockExtractMediaTypeArrayFromMessages,
  resetProviderUtilsMocks,
} from '../../mocks/provider-utils.mock';
import { createMockRouterClient } from '../../mocks/router-client.mock';
import {
  createTestPayload,
  mockConsole,
  setupTestEnv,
} from '../../utils/test-helpers';
import * as llmGatewayFetchWrapper from '../../../src/utils/llmGatewayFetchWrapper';
import * as llmGatewayMapper from '../../../src/utils/llmGatewayMapper';
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
    const client = new IronlabsChatClient(config, mockRouter);

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
    const client = new IronlabsChatClient(config, mockRouter);

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

  it('routes through gateway even when provider env var is set', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'openrouter-test-key',
      },
    };
    const client = new IronlabsChatClient(config, mockRouter);

    // GOOGLE_API_KEY is set by setupTestEnv() — should still route through gateway
    mockGetOpenRouterIdentifier.mockReturnValue('google/gemini-2.0-flash-001');
    setupSuccessfulGeneration('Gateway response');

    await client.completions(
      createTestPayload({
        models: ['google/gemini-1.5-pro-latest'] as [string, ...string[]],
      })
    );

    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    // Model name should be the OpenRouter identifier, NOT raw
    expect(requestConfig.model.modelId).toBe('google/gemini-2.0-flash-001');
  });

  it('routes through gateway even with programmatic provider config', async () => {
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
    const client = new IronlabsChatClient(config, mockRouter);

    setupSuccessfulGeneration('Gateway via programmatic config');

    const result = await client.completions(createTestPayload());

    expect(result.response.content).toBe('Gateway via programmatic config');
    // Model name should be gateway-prefixed, not raw
    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    expect(requestConfig.model.modelId).toBe('openai/gpt-4o-mini');
  });

  it('falls back to direct provider when no gateway is configured', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      // No gateway configured
    };
    const client = new IronlabsChatClient(config, mockRouter);

    // OPENAI_API_KEY is set by setupTestEnv() — direct provider path
    setupSuccessfulGeneration('Direct response');

    const result = await client.completions(createTestPayload());

    expect(result.response.content).toBe('Direct response');
    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    // Model name should be raw (direct provider, no gateway prefix)
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
    const client = new IronlabsChatClient(config, mockRouter);

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
      const client = new IronlabsChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Reasoning response');

      await client.completions(createTestPayload({ reasoningEffort: 'high' }));

      expect(buildExtraBodySpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'high' })
      );
      // When extra body is returned, the fetch wrapper is created
      expect(fetchWrapperSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoning: { effort: 'high' } }),
        expect.any(Function),
        undefined,
        expect.any(Function)
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
      const client = new IronlabsChatClient(config, mockRouter);

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
        }),
        expect.any(Function),
        undefined,
        expect.any(Function)
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
      const client = new IronlabsChatClient(config, mockRouter);

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
        }),
        expect.any(Function),
        undefined,
        expect.any(Function)
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
      const client = new IronlabsChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Plain response');

      await client.completions(createTestPayload());

      // buildOpenRouterExtraBody always returns provider config (sort by latency)
      expect(buildExtraBodySpy).toHaveBeenCalled();
      expect(buildExtraBodySpy).toHaveReturnedWith({
        provider: { sort: 'latency' },
      });
      // Fetch wrapper is always created for OpenRouter (provider sort is always set)
      expect(fetchWrapperSpy).toHaveBeenCalled();
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
      const client = new IronlabsChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Non-OpenRouter response');

      await client.completions(createTestPayload({ reasoningEffort: 'high' }));

      // buildOpenRouterExtraBody should NOT be called for non-OpenRouter gateways
      expect(buildExtraBodySpy).not.toHaveBeenCalled();
      expect(fetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('uses OpenRouter mapping even when provider has direct API key', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-test-key',
        },
      };
      const client = new IronlabsChatClient(config, mockRouter);

      // OPENAI_API_KEY is set by setupTestEnv() — should still route through gateway
      setupSuccessfulGeneration('Gateway response');

      await client.completions(createTestPayload());

      // Gateway is always used — OpenRouter mapping is called
      expect(buildExtraBodySpy).toHaveBeenCalled();
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
      const client = new IronlabsChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Subdomain response');

      await client.completions(
        createTestPayload({ reasoningEffort: 'medium' })
      );

      expect(buildExtraBodySpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'medium' })
      );
      expect(fetchWrapperSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoning: { effort: 'medium' } }),
        expect.any(Function),
        undefined,
        expect.any(Function)
      );
    });
  });

  describe('PDF routing', () => {
    let buildLLMGatewayExtraBodySpy: jest.SpyInstance;
    let createLLMGatewayFetchWrapperSpy: jest.SpyInstance;
    let buildOpenRouterExtraBodySpy: jest.SpyInstance;
    let createOpenRouterFetchWrapperSpy: jest.SpyInstance;

    beforeEach(() => {
      buildLLMGatewayExtraBodySpy = jest.spyOn(
        llmGatewayMapper,
        'buildLLMGatewayExtraBody'
      );
      createLLMGatewayFetchWrapperSpy = jest.spyOn(
        llmGatewayFetchWrapper,
        'createLLMGatewayFetchWrapper'
      );
      buildOpenRouterExtraBodySpy = jest.spyOn(
        openRouterMapper,
        'buildOpenRouterExtraBody'
      );
      createOpenRouterFetchWrapperSpy = jest.spyOn(
        openRouterFetchWrapper,
        'createOpenRouterFetchWrapper'
      );
    });

    afterEach(() => {
      buildLLMGatewayExtraBodySpy.mockRestore();
      createLLMGatewayFetchWrapperSpy.mockRestore();
      buildOpenRouterExtraBodySpy.mockRestore();
      createOpenRouterFetchWrapperSpy.mockRestore();
      delete process.env.OPENROUTER_API_KEY;
    });

    it('routes PDF requests through LLM Gateway when it is configured', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
        },
      };
      const client = new IronlabsChatClient(config, mockRouter);

      process.env.OPENROUTER_API_KEY = 'or-key';
      mockExtractMediaTypeArrayFromMessages.mockReturnValue(['pdf']);
      setupSuccessfulGeneration('LLM Gateway PDF response');

      const result = await client.completions(createTestPayload());

      expect(result.response.content).toBe('LLM Gateway PDF response');
      expect(buildLLMGatewayExtraBodySpy).toHaveBeenCalled();
      expect(createLLMGatewayFetchWrapperSpy).toHaveBeenCalled();
      expect(buildOpenRouterExtraBodySpy).not.toHaveBeenCalled();
      expect(createOpenRouterFetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('routes PDF requests through OpenRouter when it is the configured gateway', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-test-key',
        },
      };
      const client = new IronlabsChatClient(config, mockRouter);

      mockExtractMediaTypeArrayFromMessages.mockReturnValue(['pdf']);
      setupSuccessfulGeneration('OpenRouter PDF response');

      const result = await client.completions(createTestPayload());

      expect(result.response.content).toBe('OpenRouter PDF response');
      expect(buildOpenRouterExtraBodySpy).toHaveBeenCalled();
      expect(createOpenRouterFetchWrapperSpy).toHaveBeenCalled();
      expect(buildLLMGatewayExtraBodySpy).not.toHaveBeenCalled();
      expect(createLLMGatewayFetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('uses OpenRouter fallback key for PDFs when no gateway is configured', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        openRouterFallbackKey: 'or-fallback-key',
      };
      const client = new IronlabsChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      mockExtractMediaTypeArrayFromMessages.mockReturnValue(['pdf']);
      setupSuccessfulGeneration('OpenRouter fallback PDF response');

      const result = await client.completions(createTestPayload());

      expect(result.response.content).toBe('OpenRouter fallback PDF response');
      expect(createOpenRouterFetchWrapperSpy).toHaveBeenCalled();
      expect(createLLMGatewayFetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('preserves OpenRouter routing for images when LLM Gateway is configured', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
        },
      };

      delete process.env.OPENAI_API_KEY;
      process.env.OPENROUTER_API_KEY = 'or-key';
      const client = new IronlabsChatClient(config, mockRouter);

      mockExtractMediaTypeArrayFromMessages.mockReturnValue(['image']);
      setupSuccessfulGeneration('OpenRouter image response');

      const result = await client.completions(createTestPayload());

      expect(result.response.content).toBe('OpenRouter image response');
      expect(createOpenRouterFetchWrapperSpy).toHaveBeenCalled();
      expect(createLLMGatewayFetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('handles mixed image and PDF content correctly', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
        },
      };

      delete process.env.OPENAI_API_KEY;
      process.env.OPENROUTER_API_KEY = 'or-key';
      const client = new IronlabsChatClient(config, mockRouter);

      mockExtractMediaTypeArrayFromMessages.mockReturnValue(['image', 'pdf']);
      setupSuccessfulGeneration('OpenRouter mixed content response');

      const result = await client.completions(createTestPayload());

      // When both images and PDFs are present, OpenRouter is used because images require it
      expect(result.response.content).toBe('OpenRouter mixed content response');
      expect(createOpenRouterFetchWrapperSpy).toHaveBeenCalled();
      expect(createLLMGatewayFetchWrapperSpy).not.toHaveBeenCalled();
    });
  });
});
