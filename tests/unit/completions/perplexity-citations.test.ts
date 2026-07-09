// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { IronlabsChatClient } from '../../../src/ironlabs-chat-client/IronlabsChatClient';
import type { Config } from '../../../src/types';
import {
  mockStreamText,
  setupStreamWithParts,
  setupSuccessfulStream,
} from '../../mocks/ai-sdk.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';
import { createMockRouterClient } from '../../mocks/router-client.mock';
import { resetSupportedModelsMocks } from '../../mocks/supported-models.mock';
import {
  createTestPayload,
  setupTestEnv,
  mockConsole,
} from '../../utils/test-helpers';

// Regression coverage for the Perplexity streaming crash: sonar emits
// `url_citation` annotations, which @ai-sdk/openai surfaces as `source` parts.
// A version skew (annotation shape) made the stream error out, and because the
// client only guarded 5 of streamText()'s ~20 settled promises, the sibling
// `sources`/`content` promises rejected UNHANDLED and crashed the host process
// (uncaughtException: "the worker has exited"). These tests lock in that the
// streaming + Perplexity path yields sources and never leaks an unhandled
// rejection.
describe('Perplexity streaming — url_citation sources', () => {
  let client: IronlabsChatClient;
  let mockRouter: ReturnType<typeof createMockRouterClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSupportedModelsMocks();
    resetProviderUtilsMocks();
    setupTestEnv();
    process.env.PERPLEXITY_API_KEY = 'test-perplexity-key';
    mockConsole();

    mockRouter = createMockRouterClient();
    const config: Config = { apiKey: 'test-api-key' };
    client = new IronlabsChatClient(config, mockRouter);
  });

  afterEach(() => {
    delete process.env.PERPLEXITY_API_KEY;
  });

  const SOURCE_PART = {
    type: 'source' as const,
    sourceType: 'url' as const,
    id: 'src-1',
    url: 'https://en.wikipedia.org/wiki/Hello',
    title: 'Hello - Wikipedia',
  };

  it('streams url_citation source parts through fullStream for perplexity/sonar', async () => {
    setupStreamWithParts([
      { type: 'text-delta', textDelta: 'hello' },
      { type: 'text-delta', textDelta: ' is' },
      SOURCE_PART,
    ]);

    const payload = createTestPayload({
      models: ['perplexity/sonar'] as [string, ...string[]],
      stream: true,
    });

    const result = await client.completions(payload);
    expect(result.provider).toBe('perplexity');
    expect(result.model).toBe('sonar');
    expect(result.response.fullStream).toBeDefined();

    const parts: unknown[] = [];
    for await (const part of result.response.fullStream!) {
      parts.push(part);
    }

    // The citation source survives the client's stream wrapper intact.
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'source',
        url: 'https://en.wikipedia.org/wiki/Hello',
      })
    );
  });

  it('guards every settled promise so a stream failure cannot leak an unhandled rejection', async () => {
    // The old code only attached .catch() to finishReason/totalUsage/usage/
    // steps/text. When sonar's citation chunk failed validation, the unguarded
    // `sources`/`content`/… promises rejected unhandled → process crash. Assert
    // the client now attaches a handler to every settled promise it exposes.
    const mockStream = setupSuccessfulStream(['hello']);

    const guardedFields = [
      'content',
      'sources',
      'reasoning',
      'files',
      'toolCalls',
      'warnings',
      'providerMetadata',
    ] as const;
    const catchSpies = guardedFields.map(field =>
      jest.spyOn(
        mockStream[field as keyof typeof mockStream] as Promise<unknown>,
        'catch'
      )
    );

    const payload = createTestPayload({
      models: ['perplexity/sonar'] as [string, ...string[]],
      stream: true,
    });

    await client.completions(payload);

    // Every previously-unguarded settled promise now has a .catch() handler.
    for (const spy of catchSpies) {
      expect(spy).toHaveBeenCalled();
    }
  });

  it('surfaces a handled error (not a crash) when the stream fails mid-flight', async () => {
    setupStreamWithParts([
      { type: 'text-delta', textDelta: 'hello' },
      {
        type: 'error',
        error: { message: 'AI_TypeValidationError: url_citation' },
      },
    ]);

    const payload = createTestPayload({
      models: ['perplexity/sonar'] as [string, ...string[]],
      stream: true,
    });

    const result = await client.completions(payload);

    const drain = async () => {
      for await (const _part of result.response.fullStream!) {
        // consume
      }
    };

    await expect(drain()).rejects.toThrow(/Streaming failed for provider/);
    expect(mockStreamText).toHaveBeenCalled();
  });
});
