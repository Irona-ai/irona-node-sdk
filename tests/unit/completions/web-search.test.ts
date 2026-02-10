// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import type { Config } from '../../../src/types';
import {
  setupSuccessfulGeneration,
  mockGenerateText,
} from '../../mocks/ai-sdk.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';
import { createMockRouterClient } from '../../mocks/router-client.mock';
import {
  mockDoesModelSupportWebSearch,
  resetSupportedModelsMocks,
} from '../../mocks/supported-models.mock';
import {
  createTestPayload,
  setupTestEnv,
  mockConsole,
} from '../../utils/test-helpers';

describe('Web Search Integration', () => {
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

  it('enables web search for supported models', async () => {
    mockDoesModelSupportWebSearch.mockReturnValue(true);
    setupSuccessfulGeneration('Search enabled response');

    const payload = createTestPayload({
      messages: [{ role: 'user', content: 'What is the weather today?' }],
      models: ['openai/gpt-4o'] as [string, ...string[]],
      search: true,
    });

    await client.completions(payload);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          web_search_preview: expect.any(Object),
        }),
      })
    );
  });

  it('does not enable web search for unsupported models', async () => {
    mockDoesModelSupportWebSearch.mockReturnValue(false);
    setupSuccessfulGeneration('No search response');

    const payload = createTestPayload({
      models: ['anthropic/claude-3-haiku-20240307'] as [string, ...string[]],
      search: true,
    });

    await client.completions(payload);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.not.objectContaining({
        tools: expect.any(Object),
      })
    );
  });

  it('respects search parameter when false', async () => {
    mockDoesModelSupportWebSearch.mockReturnValue(true);
    setupSuccessfulGeneration('No search requested');

    const payload = createTestPayload({
      models: ['openai/gpt-4o'] as [string, ...string[]],
      search: false,
    });

    await client.completions(payload);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.not.objectContaining({
        tools: expect.any(Object),
      })
    );
  });
});
