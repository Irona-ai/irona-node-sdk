// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import { Config } from '../../../src/types';
import {
  mockGenerateText,
  mockStreamText,
  setupSuccessfulGeneration,
  setupSuccessfulStream
} from '../../mocks/ai-sdk.mock';
import { createMockRouterClient, setupRouterSuccess } from '../../mocks/router-client.mock';
import { createTestPayload, createMultiModelPayload, setupTestEnv, mockConsole } from '../../utils/test-helpers';
import {
  mockDoesModelSupportMediaTypes,
  mockDoesModelSupportWebSearch,
  resetSupportedModelsMocks
} from '../../mocks/supported-models.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';
import { z } from 'zod';

describe('Tool Support', () => {
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

  describe('Tools in completions.create()', () => {
    it('should pass tools to Vercel AI SDK when provided', async () => {
      setupSuccessfulGeneration('Weather data retrieved');
      // Mock router for single model (it will be called internally)
      mockRouter.modelSelect.mockResolvedValue({
        providers: [{ provider: 'openai', model: 'gpt-4o-mini' }],
      });

      const mockTools = {
        getWeather: {
          description: 'Get weather for a location',
          parameters: z.object({
            location: z.string(),
          }),
        },
      };

      const payload = createTestPayload({
        tools: mockTools as any,
      });

      await client.completions(payload);

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: mockTools,
        })
      );
    });

    it('should work without tools parameter', async () => {
      setupSuccessfulGeneration('Hello!');
      mockRouter.modelSelect.mockResolvedValue({
        providers: [{ provider: 'openai', model: 'gpt-4o-mini' }],
      });

      const payload = createTestPayload();

      const result = await client.completions(payload);

      expect(result.response.content).toBe('Hello!');
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tools: expect.anything(),
        })
      );
    });

    it('should pass multiple tools to Vercel AI SDK', async () => {
      setupSuccessfulGeneration('Tools ready');
      mockRouter.modelSelect.mockResolvedValue({
        providers: [{ provider: 'openai', model: 'gpt-4o-mini' }],
      });

      const mockTools = {
        getWeather: {
          description: 'Get weather for a location',
          parameters: z.object({
            location: z.string(),
          }),
        },
        getTime: {
          description: 'Get current time',
          parameters: z.object({
            timezone: z.string(),
          }),
        },
      };

      const payload = createTestPayload({
        tools: mockTools as any,
      });

      await client.completions(payload);

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: mockTools,
        })
      );
    });

    it('should merge user tools with search tools for OpenAI', async () => {
      setupSuccessfulGeneration('Search and tool ready');
      mockRouter.modelSelect.mockResolvedValue({
        providers: [{ provider: 'openai', model: 'gpt-4o-mini' }],
      });
      // Enable web search support for this test
      mockDoesModelSupportWebSearch.mockReturnValue(true);

      const mockTools = {
        getWeather: {
          description: 'Get weather for a location',
          parameters: z.object({
            location: z.string(),
          }),
        },
      };

      const payload = createTestPayload({
        tools: mockTools as any,
        search: true,
      });

      await client.completions(payload);

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.objectContaining({
            getWeather: mockTools.getWeather,
            web_search_preview: expect.anything(),
          }),
        })
      );
    });

    it('should work with streaming when tools are provided', async () => {
      setupSuccessfulStream();
      mockRouter.modelSelect.mockResolvedValue({
        providers: [{ provider: 'openai', model: 'gpt-4o-mini' }],
      });

      const mockTools = {
        calculate: {
          description: 'Perform calculations',
          parameters: z.object({
            expression: z.string(),
          }),
        },
      };

      const payload = createTestPayload({
        stream: true,
        tools: mockTools as any,
      });

      const result = await client.completions(payload);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: mockTools,
        })
      );
      expect(result.response.fullStream).toBeDefined();
    });

    it('should pass tools with multi-model routing', async () => {
      setupRouterSuccess(mockRouter, 'openai', 'gpt-4o-mini');
      setupSuccessfulGeneration('Routed with tools');

      const mockTools = {
        search: {
          description: 'Search for information',
          parameters: z.object({
            query: z.string(),
          }),
        },
      };

      const payload = createMultiModelPayload({
        tools: mockTools as any,
      });

      await client.completions(payload);

      expect(mockRouter.modelSelect).toHaveBeenCalled();
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: mockTools,
        })
      );
    });
  });

  describe('Tools in model-select', () => {
    it('should accept tools parameter but not use it', async () => {
      setupRouterSuccess(mockRouter, 'openai', 'gpt-4o-mini');
      setupSuccessfulGeneration('Model selected');

      const mockTools = {
        getWeather: {
          description: 'Get weather',
          parameters: z.object({
            location: z.string(),
          }),
        },
      };

      const payload = createMultiModelPayload({
        tools: mockTools as any,
      });

      await client.completions(payload);

      // modelSelect is called internally, but tools don't affect routing
      expect(mockRouter.modelSelect).toHaveBeenCalled();

      // Tools should still be passed to the final LLM call
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: mockTools,
        })
      );
    });
  });
});
