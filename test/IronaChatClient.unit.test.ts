import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IronaChatClient } from '../src/irona-chat-client/IronaChatClient';
import { BadRequestError, MissingApiKeyError } from '../src/errors';

// ToDO remove console log after pr review.
// Mock dependencies
vi.mock('../src/supported_models', () => ({
  doesModelSupportMediaTypes: () => true,
  providerApiKeyName: () => 'OPENAI_API_KEY',
  doesModelSupportWebSearch: () => false,
}));
vi.mock('../src/utils/providerAndModelUtils', () => ({
  getSupportedProviderAndModelArray: (models: string[]) => models.map(m => ({ provider: 'openai', model: 'gpt-4-turbo' })),
  validateAndGetProviderAndModel: (model: string) => ({ provider: 'openai', model: 'gpt-4-turbo' }),
  extractMediaTypeArrayFromMessages: () => [],
}));
vi.mock('../src/utils/requestValidator', () => ({
  validateSchema: (schema: any, payload: any) => ({ success: !!payload.messages && !!payload.models }),
}));

const mockConfig = { apiKey: 'IRONA-TEST-KEY' };
const mockRouter = {
  modelSelect: vi.fn().mockResolvedValue({ providers: [{ provider: 'openai', model: 'gpt-4-turbo' }] }),
};

describe('IronaChatClient basic', () => {
  let client: IronaChatClient;

  beforeEach(() => {
    client = new IronaChatClient(mockConfig as any, mockRouter as any);
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  describe('completions', () => {
    it('should throw BadRequestError for invalid payload', async () => {
      try {
        await client.completions({} as any);
      } catch (err) {
        console.log('Invalid payload error:', err);
        expect(err).toBeInstanceOf(BadRequestError);
        return; // Do NOT rethrow, so Vitest knows the test passed
      }
      throw new Error('Expected BadRequestError, but no error was thrown');
    });

    it('should return a response for a valid payload', async () => {
      vi.spyOn(client as any, 'invokeChatCompletions').mockResolvedValue({
        response: { content: 'Hi!', role: 'assistant' },
        provider: 'openai',
        model: 'gpt-4-turbo',
      });
      const validPayload = {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        models: ['openai/gpt-4-turbo'],
      };
      const result = await client.completions(validPayload as any);
      console.log('Valid payload result:', result);
      expect(result.response.content).toBe('Hi!');
      expect(result.provider).toBe('openai');
    });
  });

  describe('completions edge cases', () => {
    it('should try fallback_models if first model fails', async () => {
      // First model fails, fallback succeeds
      const fallback = { provider: 'openai', model: 'gpt-4-turbo-fallback' };
      vi.spyOn(client as any, 'selectBestModel').mockResolvedValue({ provider: 'openai', model: 'gpt-4-turbo' });
      vi.spyOn(client as any, 'invokeChatCompletions')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ response: { content: 'Fallback!', role: 'assistant' }, provider: 'openai', model: 'gpt-4-turbo-fallback' });
      const validPayload = {
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        models: ['openai/gpt-4-turbo'],
        fallback_models: ['openai/gpt-4-turbo-fallback'],
      };
      const result = await client.completions(validPayload as any);
      console.log('Fallback result:', result);
      expect(result.response.content).toBe('Fallback!');
      expect(result.model).toBe('gpt-4-turbo-fallback');
    });

    it('should throw BadRequestError if models array is empty', async () => {
      const payload = {
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        models: [],
      };
      await expect(client.completions(payload as any)).rejects.toThrow(
        "[IronaChatClient][completions] All attempts to process the completions request failed"
      );
    });

    it('should throw BadRequestError for invalid message structure', async () => {
      const payload = {
        messages: [
          { role: 'user', content: 123 }, // invalid content type
        ],
        models: ['openai/gpt-4-turbo'],
      };
      await expect(client.completions(payload as any)).rejects.toThrow(
        "[IronaChatClient][completions] All attempts to process the completions request failed"
      );
    });
  });

  describe('invokeChatCompletions', () => {
    it('should throw MissingApiKeyError if API key is missing', async () => {
      delete process.env.OPENAI_API_KEY;
      const validPayload = {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        models: ['openai/gpt-4-turbo'],
      };
      await expect(
        (client as any).invokeChatCompletions('openai', 'gpt-4-turbo', validPayload, false)
      ).rejects.toThrow("OPENAI_API_KEY is missing or empty");
    });

    it('should throw if model instance is not found', async () => {
      // Mock getModelInstance to return undefined
      vi.spyOn(client as any, 'getModelInstance').mockReturnValue(undefined);
      const validPayload = {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        models: ['openai/gpt-4-turbo'],
      };
      await expect(
        (client as any).invokeChatCompletions('openai', 'gpt-4-turbo', validPayload, false)
      ).rejects.toThrow('No model instance found for provider: openai');
    });
  });

  describe('invokeChatCompletions edge cases', () => {
    it('should throw if generateText throws', async () => {
      // Patch getModelInstance to return a function that throws
      vi.spyOn(client as any, 'getModelInstance').mockReturnValue(() => { throw new Error('generateText error'); });
      const validPayload = {
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        models: ['openai/gpt-4-turbo'],
      };
      await expect(
        (client as any).invokeChatCompletions('openai', 'gpt-4-turbo', validPayload, false)
      ).rejects.toThrow('generateText error');
    });

    it('should throw for invalid message format', async () => {
      const validPayload = {
        messages: [
          { role: 'user', content: 123 },
        ],
        models: ['openai/gpt-4-turbo'],
      };
      await expect(
        (client as any).invokeChatCompletions('openai', 'gpt-4-turbo', validPayload, false)
      ).rejects.toThrow();
    });
  });

  describe('getModelInstance', () => {
    it('should return a function for openai without web search', () => {
      // Should return openai(modelName) when search is false
      const instance = (client as any).getModelInstance('openai', 'gpt-4-turbo', false, false);
      expect(typeof instance).toBe('function');
      // Should call openai with model name
      const mockOpenai = vi.fn();
      // Patch openai to our mock
      (instance as any).openai = mockOpenai;
      instance('gpt-4-turbo'); // Should not throw
    });

    it('should return a function for openai with web search', () => {
      // Should return openai.responses(modelName) when search and supportsWebSearch are true
      const instance = (client as any).getModelInstance('openai', 'gpt-4-turbo', true, true);
      expect(typeof instance).toBe('function');
      // Should call openai.responses with model name
      // (We can't check the real call, but we can check the function type)
    });

    it('should return a function for google with web search', () => {
      // Should return google(modelName, { useSearchGrounding: true })
      const instance = (client as any).getModelInstance('google', 'gemini-1.0-pro', true, true);
      expect(typeof instance).toBe('function');
      // Should call google with model name and options
    });

    it('should return a function for google without web search', () => {
      // Should return google(modelName, { useSearchGrounding: false })
      const instance = (client as any).getModelInstance('google', 'gemini-1.0-pro', false, false);
      expect(typeof instance).toBe('function');
    });

    it('should return a function for other providers', () => {
      // Should return the provider function for anthropic
      const instance = (client as any).getModelInstance('anthropic', 'claude-3-opus', false, false);
      expect(typeof instance).toBe('function');
    });
  });

  describe('getModelInstance edge cases', () => {
    it('should return undefined for unknown provider', () => {
      const instance = (client as any).getModelInstance('unknown', 'model', false, false);
      expect(instance).toBeUndefined();
    });
    it('should return undefined if provider is missing', () => {
      const instance = (client as any).getModelInstance(undefined, 'model', false, false);
      expect(instance).toBeUndefined();
    });
  });
}); 