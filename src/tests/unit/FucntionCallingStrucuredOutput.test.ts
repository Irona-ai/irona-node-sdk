import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IronaChatClient } from '../../irona-chat-client/IronaChatClient';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { IronaRouterClient } from '../../irona-router-client/IronaRouterClient';
import { z } from 'zod';

// Mock the AI SDK functions
vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn()
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn()
}));

// Mock IronaRouterClient
vi.mock('../../irona-router-client/IronaRouterClient', () => ({
  IronaRouterClient: vi.fn().mockImplementation(() => ({
    modelSelect: vi.fn()
  }))
}));

describe('IronaChatClient - Extended', () => {
  let client: IronaChatClient;
  let mockRouter: IronaRouterClient;
  const mockConfig = {
    apiKey: 'test-api-key',
    modelName: 'test-model',
    temperature: 0.7,
    maxTokens: 100
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter = new IronaRouterClient({
      apiKey: 'test-api-key',
      baseUrl: 'https://test-url.com'
    });
    client = new IronaChatClient({
      apiKey: 'test-api-key',
      fallback_models: [],
      baseUrl: 'https://test-url.com'
    }, mockRouter);
  });

  describe('Function Calling', () => {
    it('should simulate function calling format', async () => {
      const mockOpenAIModel = { name: 'openai-model' };
      vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);

      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify({
          function_call: {
            name: 'getCapital',
            arguments: JSON.stringify({ country: 'India' })
          }
        })
      } as any);

      const chatModel = client['getChatModel']('openai', mockConfig);

      const messages = [{ role: 'user', content: 'What is the capital of India?' }];
      const result = await chatModel.invoke(messages);

      const parsed = JSON.parse(result.content.text);

      expect(parsed.function_call.name).toBe('getCapital');
      expect(JSON.parse(parsed.function_call.arguments)).toEqual({ country: 'India' });
    });
  });

  describe('Structured Output', () => {
    it('should parse output using zod schema', async () => {
      const mockOpenAIModel = { name: 'openai-model' };
      vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);

      const mockText = JSON.stringify({ title: 'Atomic Habits', author: 'James Clear' });
      vi.mocked(generateText).mockResolvedValue({ text: mockText } as any);

      const chatModel = client['getChatModel']('openai', mockConfig);

      const messages = [{ role: 'user', content: 'Give me the title and author of Atomic Habits.' }];
      const result = await chatModel.invoke(messages);

      const schema = z.object({
        title: z.string(),
        author: z.string()
      });

      const parsed = schema.parse(JSON.parse(result.content.text));

      expect(parsed.title).toBe('Atomic Habits');
      expect(parsed.author).toBe('James Clear');
    });
  });
});
