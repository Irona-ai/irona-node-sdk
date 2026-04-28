import type { CompletionsPayload } from '../../src/schemas/completions.schema';

// Create test payloads with type safety
export const createTestPayload = (
  overrides?: Partial<CompletionsPayload>
): CompletionsPayload => {
  return {
    messages: [{ role: 'user', content: 'Hello world' }],
    models: ['openai/gpt-4o-mini'] as [string, ...string[]],
    ...overrides,
  };
};

export const createMultiModelPayload = (
  overrides?: Partial<CompletionsPayload>
): CompletionsPayload => {
  return {
    messages: [{ role: 'user', content: 'Hello world' }],
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku-20240307'] as [
      string,
      ...string[],
    ],
    ...overrides,
  };
};

export const createImagePayload = (): CompletionsPayload => {
  return {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this image?' },
          {
            type: 'image_url' as const,
            image_url: { url: 'https://example.com/image.jpg' },
          },
        ],
      },
    ],
    models: ['openai/gpt-4o-mini'] as [string, ...string[]],
  };
};

// Environment variable helpers
export const setupTestEnv = () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.GOOGLE_API_KEY = 'test-google-key';
};

export const cleanupTestEnv = () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_API_KEY;
};

// Console mock helpers
export const mockConsole = () => {
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
};

export const restoreConsole = () => {
  (console.log as jest.Mock).mockRestore();
  (console.warn as jest.Mock).mockRestore();
  (console.error as jest.Mock).mockRestore();
};
