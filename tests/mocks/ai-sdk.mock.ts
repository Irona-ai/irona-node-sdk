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

export const setupSuccessfulGeneration = (text: string = 'Test response') => {
  mockGenerateText.mockResolvedValue({ text });
};

// streamText() returns its result synchronously (the promise fields on the
// result settle later) — it is not itself async. Mocks must mirror that with
// mockReturnValue, not mockResolvedValue, and must expose the settled-promise
// fields the client attaches no-op .catch() handlers to.
const withSettledPromiseFields = <T extends { fullStream: unknown }>(
  stream: T
) => ({
  ...stream,
  finishReason: Promise.resolve('stop'),
  totalUsage: Promise.resolve({}),
  usage: Promise.resolve({}),
  steps: Promise.resolve([]),
  text: Promise.resolve(''),
});

export const setupSuccessfulStream = (
  chunks: string[] = ['Hello', ' world']
) => {
  const mockStream = withSettledPromiseFields({
    fullStream: {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield { type: 'text-delta', textDelta: chunk };
        }
      },
    },
  });
  mockStreamText.mockReturnValue(mockStream);
  return mockStream;
};

export const setupStreamError = () => {
  const mockStream = withSettledPromiseFields({
    fullStream: {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'error', error: 'Stream error' };
      },
    },
  });
  mockStreamText.mockReturnValue(mockStream);
  return mockStream;
};

export const setupEmptyStream = () => {
  const mockStream = withSettledPromiseFields({
    fullStream: {
      [Symbol.asyncIterator]: async function* () {
        // Yields nothing — empty stream
      },
    },
  });
  mockStreamText.mockReturnValue(mockStream);
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
