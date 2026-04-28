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
  mockGetLLMGatewayIdentifier,
  resetSupportedModelsMocks,
} from '../../mocks/supported-models.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';
import { createMockRouterClient } from '../../mocks/router-client.mock';
import {
  createTestPayload,
  mockConsole,
  setupTestEnv,
} from '../../utils/test-helpers';
import * as llmGatewayMapper from '../../../src/utils/llmGatewayMapper';
import * as llmGatewayFetchWrapper from '../../../src/utils/llmGatewayFetchWrapper';

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
        baseUrl: 'https://api.llmgateway.io/v1',
        apiKey: 'llmgateway-test-key',
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

  it('uses LLMGateway model mapping when available and no provider key is set', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://api.llmgateway.io/v1',
        apiKey: 'llmgateway-test-key',
      },
    };
    const client = new IronaChatClient(config, mockRouter);

    // Delete direct provider key so google routes through gateway
    delete process.env.GOOGLE_API_KEY;
    mockGetLLMGatewayIdentifier.mockReturnValue('gemini-2.0-flash-001');
    setupSuccessfulGeneration('Mapped response');

    await client.completions(
      createTestPayload({
        models: ['google/gemini-1.5-pro-latest'] as [string, ...string[]],
      })
    );

    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    expect(requestConfig.model.modelId).toBe('gemini-2.0-flash-001');
  });

  it('routes through gateway even when provider env var is set', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://api.llmgateway.io/v1',
        apiKey: 'llmgateway-test-key',
      },
    };
    const client = new IronaChatClient(config, mockRouter);

    // GOOGLE_API_KEY is set by setupTestEnv() — should still route through gateway
    mockGetLLMGatewayIdentifier.mockReturnValue('gemini-2.0-flash-001');
    setupSuccessfulGeneration('Gateway response');

    await client.completions(
      createTestPayload({
        models: ['google/gemini-1.5-pro-latest'] as [string, ...string[]],
      })
    );

    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    // Model name should be the LLMGateway identifier (bare, no provider prefix)
    expect(requestConfig.model.modelId).toBe('gemini-2.0-flash-001');
  });

  it('routes through gateway even with programmatic provider config', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      gateway: {
        baseUrl: 'https://api.llmgateway.io/v1',
        apiKey: 'llmgateway-test-key',
      },
      providers: {
        openai: { apiKey: 'programmatic-openai-key' },
      },
    };
    const client = new IronaChatClient(config, mockRouter);

    setupSuccessfulGeneration('Gateway via programmatic config');

    const result = await client.completions(createTestPayload());

    expect(result.response.content).toBe('Gateway via programmatic config');
    // LLMGateway uses bare model names (no provider prefix)
    const requestConfig = mockGenerateText.mock.calls[0][0] as {
      model: { modelId: string };
    };
    expect(requestConfig.model.modelId).toBe('gpt-4o-mini');
  });

  it('falls back to direct provider when no gateway is configured', async () => {
    const mockRouter = createMockRouterClient();
    const config: Config = {
      apiKey: 'test-api-key',
      // No gateway configured
    };
    const client = new IronaChatClient(config, mockRouter);

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

  describe('LLMGateway payload mapping', () => {
    let buildExtraBodySpy: jest.SpyInstance;
    let fetchWrapperSpy: jest.SpyInstance;

    beforeEach(() => {
      buildExtraBodySpy = jest.spyOn(
        llmGatewayMapper,
        'buildLLMGatewayExtraBody'
      );
      fetchWrapperSpy = jest.spyOn(
        llmGatewayFetchWrapper,
        'createLLMGatewayFetchWrapper'
      );
    });

    afterEach(() => {
      buildExtraBodySpy.mockRestore();
      fetchWrapperSpy.mockRestore();
    });

    it('sends reasoning params through LLMGateway', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Reasoning response');

      await client.completions(createTestPayload({ reasoningEffort: 'high' }));

      expect(buildExtraBodySpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'high' })
      );
      expect(fetchWrapperSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reasoning: { effort: 'high' } })
      );
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it('sends search params through LLMGateway', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
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
          tools: [{ type: 'web_search' }],
        })
      );
    });

    it('sends search tool even when model is not in Gist capabilities (new models like gpt-5.2)', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      // Model is NOT listed as supporting web search in the Gist
      mockDoesModelSupportWebSearch.mockReturnValue(false);
      setupSuccessfulGeneration('Search response');

      await client.completions(createTestPayload({ search: true }));

      // LLM Gateway always receives the web_search tool when search is requested,
      // regardless of Gist capabilities — the gateway validates model support itself.
      expect(fetchWrapperSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [{ type: 'web_search' }],
        })
      );
    });

    it('sends both reasoning and search through LLMGateway', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
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
          tools: [{ type: 'web_search' }],
        })
      );
    });

    it('creates fetch wrapper even when no extra features are requested (handles native reasoning cleanup)', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      delete process.env.OPENAI_API_KEY;
      setupSuccessfulGeneration('Plain response');

      await client.completions(createTestPayload());

      expect(buildExtraBodySpy).toHaveBeenCalled();
      expect(buildExtraBodySpy).toHaveReturnedWith({});
      // Fetch wrapper is always created so delta.reasoning cleanup is always applied
      expect(fetchWrapperSpy).toHaveBeenCalled();
    });

    it('does not use LLMGateway mapping for non-LLMGateway gateways', async () => {
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
      setupSuccessfulGeneration('Non-LLMGateway response');

      await client.completions(createTestPayload({ reasoningEffort: 'high' }));

      // buildLLMGatewayExtraBody should NOT be called for non-LLMGateway gateways
      expect(buildExtraBodySpy).not.toHaveBeenCalled();
      expect(fetchWrapperSpy).not.toHaveBeenCalled();
    });

    it('uses LLMGateway mapping even when provider has direct API key', async () => {
      const mockRouter = createMockRouterClient();
      const config: Config = {
        apiKey: 'test-api-key',
        gateway: {
          baseUrl: 'https://api.llmgateway.io/v1',
          apiKey: 'llmgateway-test-key',
        },
      };
      const client = new IronaChatClient(config, mockRouter);

      // OPENAI_API_KEY is set by setupTestEnv() — should still route through gateway
      setupSuccessfulGeneration('Gateway response');

      await client.completions(createTestPayload());

      // Gateway is always used — LLMGateway mapping is called
      expect(buildExtraBodySpy).toHaveBeenCalled();
    });
  });
});
