import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IronaChatClient } from '../../irona-chat-client/IronaChatClient';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { IronaRouterClient } from '../../irona-router-client/IronaRouterClient';

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

describe('IronaChatClient', () => {
  let client: IronaChatClient;
  let mockRouter: IronaRouterClient;
  const mockConfig = {
    apiKey: 'test-api-key',
    modelName: 'test-model',
    temperature: 0.7,
    maxTokens: 100
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Create mock router
    mockRouter = new IronaRouterClient({
      apiKey: 'test-api-key',
      baseUrl: 'https://test-url.com'
    });
    
    // Create a new instance of IronaChatClient
    client = new IronaChatClient({
      apiKey: 'test-api-key',
      fallback_models: [],
      baseUrl: 'https://test-url.com'
    }, mockRouter);
  });

  describe('getChatModel', () => {
    it('should throw error for invalid provider', () => {
      expect(() => {
        // @ts-ignore - Testing invalid provider
        client['getChatModel']('invalid-provider', mockConfig);
      }).toThrow('No chat model found for provider: invalid-provider');
    });

    it('should throw error for empty provider', () => {
      expect(() => {
        // @ts-ignore - Testing empty provider
        client['getChatModel']('', mockConfig);
      }).toThrow('No chat model found for provider: ');
    });

    it('should throw error for undefined provider', () => {
      expect(() => {
        // @ts-ignore - Testing undefined provider
        client['getChatModel'](undefined, mockConfig);
      }).toThrow();
    });

    it('should create OpenAI model instance', () => {
      const mockOpenAIModel = { name: 'openai-model' };
      vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);

      const chatModel = client['getChatModel']('openai', mockConfig);
      expect(openai).toHaveBeenCalledWith(mockConfig.modelName);
      expect(chatModel).toBeDefined();
    });

    describe('invoke method', () => {
      it('should call generateText with correct parameters', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        vi.mocked(generateText).mockResolvedValue({ text: 'test response' } as any);

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages = [
          { role: 'user', content: 'test message' }
        ];

        const result = await chatModel.invoke(messages);

        expect(generateText).toHaveBeenCalledWith({
          model: mockOpenAIModel,
          messages: messages,
          temperature: mockConfig.temperature,
          maxTokens: mockConfig.maxTokens
        });
        expect(result).toEqual({
          content: { text: 'test response' },
          role: 'assistant'
        });
      });

      it('should handle empty messages array', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        vi.mocked(generateText).mockResolvedValue({ text: 'test response' } as any);

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages: any[] = [];

        const result = await chatModel.invoke(messages);
        expect(result).toEqual({
          content: { text: 'test response' },
          role: 'assistant'
        });
      });

      it('should handle null messages', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);

        const chatModel = client['getChatModel']('openai', mockConfig);
        // @ts-ignore - Testing null messages
        await expect(chatModel.invoke(null)).rejects.toThrow();
      });

      it('should handle generateText errors', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        vi.mocked(generateText).mockRejectedValue(new Error('API Error'));

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages = [
          { role: 'user', content: 'test message' }
        ];

        await expect(chatModel.invoke(messages)).rejects.toThrow('API Error');
      });

      it('should handle different message formats', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        vi.mocked(generateText).mockResolvedValue({ text: 'test response' } as any);

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages = [
          { role: 'system', content: 'system message' },
          { role: 'user', content: 'user message' },
          { role: 'assistant', content: 'assistant message' }
        ];

        const result = await chatModel.invoke(messages);
        expect(result).toEqual({
          content: { text: 'test response' },
          role: 'assistant'
        });
      });
    });

    describe('stream method', () => {
      it('should call streamText with correct parameters', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        
        // Create a mock ReadableStream
        const mockTextStream = new ReadableStream({
          start(controller) {
            controller.enqueue('chunk1');
            controller.enqueue('chunk2');
            controller.close();
          }
        });

        const mockStreamResult = {
          textStream: mockTextStream,
          warnings: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          sources: [],
          files: [],
          finishReason: 'stop'
        };

        vi.mocked(streamText).mockResolvedValue(mockStreamResult as any);

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages = [
          { role: 'user', content: 'test message' }
        ];

        const stream = await chatModel.stream(messages);

        expect(streamText).toHaveBeenCalledWith({
          model: mockOpenAIModel,
          messages: messages,
          temperature: mockConfig.temperature,
          maxTokens: mockConfig.maxTokens
        });
        expect(stream).toBe(mockTextStream);
      });

      it('should handle empty messages array in stream', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        
        // Create a mock ReadableStream
        const mockTextStream = new ReadableStream({
          start(controller) {
            controller.close();
          }
        });

        const mockStreamResult = {
          textStream: mockTextStream,
          warnings: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          sources: [],
          files: [],
          finishReason: 'stop'
        };

        vi.mocked(streamText).mockResolvedValue(mockStreamResult as any);

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages: any[] = [];

        const stream = await chatModel.stream(messages);
        expect(stream).toBe(mockTextStream);
      });

      it('should handle null messages in stream', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        vi.mocked(streamText).mockRejectedValue(new Error('Cannot read properties of null (reading \'map\')'));

        const chatModel = client['getChatModel']('openai', mockConfig);
        // @ts-ignore - Testing null messages
        await expect(chatModel.stream(null)).rejects.toThrow('Cannot read properties of null (reading \'map\')');
      });

      it('should handle streamText errors', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        vi.mocked(streamText).mockRejectedValue(new Error('Stream Error'));

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages = [
          { role: 'user', content: 'test message' }
        ];

        await expect(chatModel.stream(messages)).rejects.toThrow('Stream Error');
      });

      it('should handle different message formats in stream', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        
        const mockTextStream = new ReadableStream({
          start(controller) {
            controller.enqueue('chunk1');
            controller.enqueue('chunk2');
            controller.close();
          }
        });

        const mockStreamResult = {
          textStream: mockTextStream,
          warnings: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          sources: [],
          files: [],
          finishReason: 'stop'
        };

        vi.mocked(streamText).mockResolvedValue(mockStreamResult as any);

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages = [
          { role: 'system', content: 'system message' },
          { role: 'user', content: 'user message' },
          { role: 'assistant', content: 'assistant message' }
        ];

        const stream = await chatModel.stream(messages);
        expect(stream).toBe(mockTextStream);
      });

      it('should handle stream with empty chunks', async () => {
        const mockOpenAIModel = { name: 'openai-model' };
        vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
        
        const mockTextStream = new ReadableStream({
          start(controller) {
            controller.enqueue('');
            controller.enqueue('chunk1');
            controller.enqueue('');
            controller.close();
          }
        });

        const mockStreamResult = {
          textStream: mockTextStream,
          warnings: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          sources: [],
          files: [],
          finishReason: 'stop'
        };

        vi.mocked(streamText).mockResolvedValue(mockStreamResult as any);

        const chatModel = client['getChatModel']('openai', mockConfig);
        const messages = [
          { role: 'user', content: 'test message' }
        ];

        const stream = await chatModel.stream(messages);
        expect(stream).toBe(mockTextStream);
      });
    });
  });
}); 