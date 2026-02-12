// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import { Config } from '../../../src/types';
import {
  mockGenerateText,
  setupSuccessfulGeneration,
} from '../../mocks/ai-sdk.mock';
import {
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
});
