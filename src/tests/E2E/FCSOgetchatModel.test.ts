import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IronaChatClient } from '../../irona-chat-client/IronaChatClient';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { IronaRouterClient } from '../../irona-router-client/IronaRouterClient';
import { z } from 'zod';

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn()
}));

vi.mock('ai', () => ({
  generateText: vi.fn()
}));

vi.mock('../../irona-router-client/IronaRouterClient', () => ({
  IronaRouterClient: vi.fn().mockImplementation(() => ({
    modelSelect: vi.fn()
  }))
}));

describe('E2E - getChatModel + Structured Output + Function Calling + Edge Cases', () => {
  let client: IronaChatClient;
  const config = {
    apiKey: 'test-api-key',
    modelName: 'openai-model',
    temperature: 0.7,
    maxTokens: 256
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const router = new IronaRouterClient({
      apiKey: config.apiKey,
      baseUrl: 'https://mock.com'
    });
    client = new IronaChatClient({
      apiKey: config.apiKey,
      fallback_models: [],
      baseUrl: 'https://mock.com'
    }, router);
  });

  it('throws error for undefined provider', () => {
    // @ts-ignore
    expect(() => client['getChatModel'](undefined, config)).toThrow();
  });

  it('throws error for empty string provider', () => {
    // @ts-ignore
    expect(() => client['getChatModel']('', config)).toThrow('No chat model found for provider: ');
  });

  it('throws error for unsupported provider', () => {
    // @ts-ignore
    expect(() => client['getChatModel']('something-else', config)).toThrow('No chat model found for provider: something-else');
  });

  it('handles null messages in invoke', async () => {
    const mockOpenAIModel = { name: 'openai-model' };
    vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);

    const chatModel = client['getChatModel']('openai', config);
    // @ts-ignore
    await expect(chatModel.invoke(null)).rejects.toThrow();
  });

  it('handles invalid JSON in structured output', async () => {
    const mockOpenAIModel = { name: 'openai-model' };
    vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
    vi.mocked(generateText).mockResolvedValue({ text: 'not-a-json' } as any);

    const schema = z.object({
      name: z.string(),
      score: z.number()
    });

    const chatModel = client['getChatModel']('openai', config);
    const messages = [{ role: 'user', content: 'Give me structured output' }];
    const result = await chatModel.invoke(messages);

    expect(() => schema.parse(JSON.parse(result.content.text))).toThrow();
  });

  it('throws if required field missing in structured output', async () => {
    const mockOpenAIModel = { name: 'openai-model' };
    vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ name: 'Test' }) // missing "score"
    } as any);

    const schema = z.object({
      name: z.string(),
      score: z.number()
    });

    const chatModel = client['getChatModel']('openai', config);
    const messages = [{ role: 'user', content: 'Missing field test' }];
    const result = await chatModel.invoke(messages);

    expect(() => schema.parse(JSON.parse(result.content.text))).toThrow();
  });

  it('handles malformed function call format', async () => {
    const mockOpenAIModel = { name: 'openai-model' };
    vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);

    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ function_call: 'should-be-object' })
    } as any);

    const chatModel = client['getChatModel']('openai', config);
    const messages = [{ role: 'user', content: 'Trigger function call' }];
    const result = await chatModel.invoke(messages);

    expect(() => {
      const parsed = JSON.parse(result.content.text);
      if (typeof parsed.function_call !== 'object') throw new Error('Malformed function call format');
    }).toThrow('Malformed function call format');
  });

  it('parses valid structured output successfully', async () => {
    const mockOpenAIModel = { name: 'openai-model' };
    vi.mocked(openai).mockReturnValue(mockOpenAIModel as any);

    const validData = { name: 'GPT', score: 98 };
    vi.mocked(generateText).mockResolvedValue({ text: JSON.stringify(validData) } as any);

    const schema = z.object({
      name: z.string(),
      score: z.number()
    });

    const chatModel = client['getChatModel']('openai', config);
    const messages = [{ role: 'user', content: 'Structured output?' }];
    const result = await chatModel.invoke(messages);
    const parsed = schema.parse(JSON.parse(result.content.text));

    expect(parsed).toEqual(validData);
  });
});
