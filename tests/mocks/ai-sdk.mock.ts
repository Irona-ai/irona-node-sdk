// Mock the AI SDK
jest.mock('ai', () => ({
  generateText: jest.fn(),
  streamText: jest.fn(),
}));

export const mockGenerateText = require('ai').generateText as jest.Mock;
export const mockStreamText = require('ai').streamText as jest.Mock;

export const resetAiMocks = () => {
  mockGenerateText.mockReset();
  mockStreamText.mockReset();
};

export const setupSuccessfulGeneration = (text: string = 'Test response') => {
  mockGenerateText.mockResolvedValue({ text });
};

export const setupSuccessfulStream = () => {
  const mockStream = {
    fullStream: {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'text-delta', textDelta: 'Hello' };
        yield { type: 'text-delta', textDelta: ' world' };
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