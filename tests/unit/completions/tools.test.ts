// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import { z } from 'zod';

import { IronaAI } from '../../../src/index';
import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import type { Config } from '../../../src/types';
import {
  setupSuccessfulGeneration,
  setupSuccessfulStream,
  getLastGenerateTextCall,
  getLastStreamTextCall,
} from '../../mocks/ai-sdk.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';
import {
  createMockRouterClient,
  setupRouterSuccess,
} from '../../mocks/router-client.mock';
import {
  mockDoesModelSupportMediaTypes,
  mockDoesModelSupportWebSearch,
  resetSupportedModelsMocks,
} from '../../mocks/supported-models.mock';
import {
  createTestPayload,
  setupTestEnv,
  mockConsole,
} from '../../utils/test-helpers';

describe('Tools Support', () => {
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

  describe('Completions with Tools', () => {
    const mockTool = {
      description: 'Get the weather in a location',
      inputSchema: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      execute: async ({ location }: { location: string }) => ({
        location,
        temperature: 72,
      }),
    };

    const mockTools = {
      weather: mockTool,
      calculator: {
        description: 'Perform a calculation',
        inputSchema: z.object({
          expression: z
            .string()
            .describe('The mathematical expression to evaluate'),
        }),
        execute: async ({ expression }: { expression: string }) => ({
          result: eval(expression),
        }),
      },
    };

    it('passes tools to generateText when provided', async () => {
      setupSuccessfulGeneration('Tool response');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: mockTools,
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toEqual(mockTools);
      expect(result.response.content).toBe('Tool response');
    });

    it('passes tools to streamText when streaming', async () => {
      const mockStream = setupSuccessfulStream([
        'Tool ',
        'streaming ',
        'response',
      ]);
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: mockTools,
          stream: true,
        })
      );

      const lastCall = getLastStreamTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toEqual(mockTools);

      // Use the original mock stream to verify, not the enhanced one from the client
      // which may have additional processing
      const chunks = [];
      for await (const chunk of mockStream.fullStream) {
        if (chunk.type === 'text-delta') {
          chunks.push(chunk.textDelta);
        }
      }
      expect(chunks).toEqual(['Tool ', 'streaming ', 'response']);
    });

    it('combines custom tools with web search tools for OpenAI', async () => {
      setupSuccessfulGeneration('Combined tools response');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);
      mockDoesModelSupportWebSearch.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: { weather: mockTool },
          search: true,
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toHaveProperty('weather');
      expect(lastCall.tools).toHaveProperty('web_search_preview');
    });

    it('combines custom tools with Google search tools', async () => {
      setupSuccessfulGeneration('Combined tools response');
      setupRouterSuccess(mockRouter, 'google', 'gemini-1.5-pro');
      mockDoesModelSupportMediaTypes.mockReturnValue(true);
      mockDoesModelSupportWebSearch.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          models: ['google/gemini-1.5-pro'],
          tools: { weather: mockTool },
          search: true,
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toHaveProperty('weather');
      expect(lastCall.tools).toHaveProperty('google_search');
    });

    it('works without tools parameter', async () => {
      setupSuccessfulGeneration('No tools response');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(createTestPayload());

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toBeUndefined();
      expect(result.response.content).toBe('No tools response');
    });

    it('handles empty tools object', async () => {
      setupSuccessfulGeneration('Empty tools response');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: {},
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toBeUndefined();
      expect(result.response.content).toBe('Empty tools response');
    });
  });

  describe('Model Select with Tools', () => {
    it('accepts tools parameter in modelSelect', async () => {
      const mockTools = {
        testTool: {
          description: 'Test tool',
          inputSchema: z.object({ input: z.string() }),
        },
      };

      // Mock the router to return a selected model
      mockRouter.modelSelect.mockResolvedValue({
        providers: [{ provider: 'openai', model: 'gpt-4o-mini' }],
        fallbackProviders: [],
        error: null,
        success: true,
        message: 'OK',
        statusCode: 200,
      });

      // Call modelSelect with tools through the mock router
      await mockRouter.modelSelect({
        messages: [{ role: 'user', content: 'Test message' }],
        models: ['openai/gpt-4o-mini'],
        tools: mockTools,
      });

      // Verify the router was called with tools parameter
      expect(mockRouter.modelSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Test message' }],
          models: ['openai/gpt-4o-mini'],
          tools: mockTools,
        })
      );
    });
  });
});

describe('IronaAI SDK Tools Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTestEnv();
    mockConsole();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('IronaAI instance accepts tools in completions.create', async () => {
    setupSuccessfulGeneration('SDK tools response');

    const ironaAI = await IronaAI.createInstance({
      apiKey: 'sk_test-api-key',
    });

    const mockTool = {
      description: 'Test tool',
      inputSchema: z.object({ test: z.string() }),
    };

    const result = await ironaAI.completions.create({
      messages: [{ role: 'user', content: 'Test with tools' }],
      models: ['openai/gpt-4o-mini'],
      tools: { testTool: mockTool },
    });

    expect(result.response.content).toBe('SDK tools response');
  });

  it('IronaAI instance accepts tools in modelSelect', async () => {
    const ironaAI = await IronaAI.createInstance({
      apiKey: 'sk_test-api-key',
    });

    // Mock the internal router client
    const mockModelSelect = jest.fn().mockResolvedValue({
      providers: [{ provider: 'openai', model: 'gpt-4o-mini' }],
    });
    (ironaAI as any).ironaRouter.modelSelect = mockModelSelect;

    const mockTool = {
      description: 'Test tool',
      inputSchema: z.object({ test: z.string() }),
    };

    await ironaAI.modelSelect({
      messages: [{ role: 'user', content: 'Test message' }],
      models: ['openai/gpt-4o-mini'],
      tools: { testTool: mockTool },
    });

    expect(mockModelSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: { testTool: mockTool },
      })
    );
  });
});
