// Mock the AI SDK
jest.mock('ai', () => ({
  generateText: jest.fn(),
  streamText: jest.fn(),
  stepCountIs: jest.fn().mockImplementation((count: number) => ({ count })),
  wrapLanguageModel: jest
    .fn()
    .mockImplementation(({ model }: { model: unknown }) => model),
  extractReasoningMiddleware: jest.fn().mockReturnValue({}),
}));

export const mockGenerateText = require('ai').generateText as jest.Mock;
export const mockStreamText = require('ai').streamText as jest.Mock;
export const mockStepCountIs = require('ai').stepCountIs as jest.Mock;

export const resetAiMocks = () => {
  mockGenerateText.mockReset();
  mockStreamText.mockReset();
  mockStepCountIs
    .mockReset()
    .mockImplementation((count: number) => ({ count }));
};

export const setupSuccessfulGeneration = (
  text: string = 'Test response',
  options: { cached?: boolean } = {}
) => {
  const totalTokens = options.cached === true ? 0 : 100;
  mockGenerateText.mockResolvedValue({
    text,
    usage: {
      totalTokens,
      promptTokens: totalTokens > 0 ? 80 : 0,
      completionTokens: totalTokens > 0 ? 20 : 0,
    },
  });
};

export const setupSuccessfulStream = (
  chunks: string[] = ['Hello', ' world']
) => {
  const mockStream = {
    fullStream: {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield { type: 'text-delta', textDelta: chunk };
        }
      },
    },
  };
  mockStreamText.mockResolvedValue(mockStream);
  return mockStream;
};

export const setupStreamError = () => {
  const mockStream = {
    fullStream: {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'error', error: 'Stream error' };
      },
    },
  };
  mockStreamText.mockResolvedValue(mockStream);
  return mockStream;
};

export const setupEmptyStream = () => {
  const mockStream = {
    fullStream: {
      [Symbol.asyncIterator]: async function* () {
        // Yields nothing — empty stream
      },
    },
  };
  mockStreamText.mockResolvedValue(mockStream);
  return mockStream;
};

// Helper functions to get the last call arguments
export const getLastGenerateTextCall = () => {
  if (mockGenerateText.mock.calls.length === 0) return undefined;
  return mockGenerateText.mock.calls[mockGenerateText.mock.calls.length - 1][0];
};

export const getLastStreamTextCall = () => {
  if (mockStreamText.mock.calls.length === 0) return undefined;
  return mockStreamText.mock.calls[mockStreamText.mock.calls.length - 1][0];
};
