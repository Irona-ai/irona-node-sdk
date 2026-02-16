/**
 * End-to-end test: LocalRouter → IronaChatClient completions
 *
 * Verifies that for the 4-model setup:
 *   SIMPLE   → openai/gpt-5-nano            ($0.05/$0.40)
 *   MEDIUM   → google/gemini-3-flash-preview ($0.50/$3.00)
 *   COMPLEX  → openai/gpt-5.2-chat-latest   ($1.75/$14.00)
 *   REASONING→ anthropic/claude-sonnet-4-5-20250929 ($3/$15)
 *
 * the local router classifies the prompt, picks the right model,
 * and IronaChatClient invokes completions with that model.
 */

// ── Mocks (must be before imports) ──────────────────────────────────────────

jest.mock('../../../src/supported_models', () => ({
  doesModelSupportMediaTypes: jest.fn().mockReturnValue(true),
  doesModelSupportWebSearch: jest.fn().mockReturnValue(false),
  isSupportedModel: jest.fn().mockReturnValue(true),
  getModelPrice: jest
    .fn()
    .mockImplementation((provider: string, model: string) => {
      const prices: Record<string, { input: number; output: number }> = {
        'openai/gpt-5-nano': { input: 0.05, output: 0.4 },
        'google/gemini-3-flash-preview': { input: 0.5, output: 3.0 },
        'openai/gpt-5.2-chat-latest': { input: 1.75, output: 14.0 },
        'anthropic/claude-sonnet-4-5-20250929': { input: 3, output: 15 },
      };
      return prices[`${provider}/${model}`] ?? null;
    }),
  getModelCapabilities: jest
    .fn()
    .mockImplementation((provider: string, model: string) => {
      const caps: Record<string, string[]> = {
        'openai/gpt-5-nano': ['routing', 'image', 'reasoning', 'mcp'],
        'google/gemini-3-flash-preview': [
          'routing',
          'image',
          'search',
          'reasoning',
        ],
        'openai/gpt-5.2-chat-latest': ['reasoning', 'image', 'search', 'mcp'],
        'anthropic/claude-sonnet-4-5-20250929': [
          'image',
          'pdf',
          'computer-use',
          'reasoning',
          'routing',
        ],
      };
      return caps[`${provider}/${model}`] ?? null;
    }),
  doesModelSupportReasoning: jest.fn().mockReturnValue(true),
  providerApiKeyName: jest.fn().mockImplementation((provider: string) => {
    const mapping: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
    };
    return mapping[provider] || `${provider.toUpperCase()}_API_KEY`;
  }),
  getModelPrefix: jest.fn().mockReturnValue(null),
  getOpenRouterIdentifier: jest.fn().mockReturnValue(null),
  updateProvidersFromGist: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('ai', () => ({
  generateText: jest.fn(),
  streamText: jest.fn(),
  stepCountIs: jest.fn().mockImplementation((count: number) => ({ count })),
}));

jest.mock('../../../src/utils/providerAndModelUtils', () => ({
  extractMediaTypeArrayFromMessages: jest.fn().mockReturnValue([]),
  getSupportedProviderAndModelArray: jest
    .fn()
    .mockImplementation((models: string[]) =>
      models.map(model => {
        const [provider, ...modelParts] = model.split('/');
        return { provider, model: modelParts.join('/') };
      })
    ),
  validateAndGetProviderAndModel: jest
    .fn()
    .mockImplementation((model: string) => {
      const [provider, ...modelParts] = model.split('/');
      return { provider, model: modelParts.join('/') };
    }),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import { LocalRouter } from '../../../src/router/local';
import type { Config } from '../../../src/types';

const mockGenerateText = require('ai').generateText as jest.Mock;
const mockStreamText = require('ai').streamText as jest.Mock;

// ── Helpers ─────────────────────────────────────────────────────────────────

const ALL_FOUR_MODELS: [string, ...string[]] = [
  'openai/gpt-5-nano',
  'google/gemini-3-flash-preview',
  'openai/gpt-5.2-chat-latest',
  'anthropic/claude-sonnet-4-5-20250929',
];

// Prompts tuned to each tier's scoring dimensions
const PROMPTS = {
  // Simple: short, matches simpleKeywords ("what is", "capital of"), no technical terms
  SIMPLE: 'What is the capital of France?',

  // Medium: moderate technical content + imperative verbs, but not heavy enough for COMPLEX
  MEDIUM:
    'Write a Python function that reads a CSV file and returns the sum of a specific column.',

  // Complex: technical + code keywords + imperative + multi-step, no reasoning keywords.
  // Scored to land in [0.30, 0.50] range (doubled boundaries).
  // Note: avoid words containing reasoning substrings (e.g. "improve" contains "prove").
  COMPLEX:
    'Design a distributed microservice architecture with Kubernetes. ' +
    'First, write the async function for database optimization; then, configure ' +
    'the algorithm for maximum throughput and integrate the monitoring infrastructure.',

  // Reasoning: explicit reasoning keywords that trigger the 2+ override
  REASONING:
    'Prove the Riemann hypothesis step by step. Use mathematical induction ' +
    'and derive the result using formal logical proof techniques.',
};

function setupGeneration(text = 'Test response') {
  mockGenerateText.mockResolvedValue({ text });
}

function setupStream(chunks: string[] = ['Hello', ' world']) {
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
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Local Router → Completions (4-model E2E)', () => {
  let client: IronaChatClient;
  let localRouter: LocalRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.GOOGLE_API_KEY = 'test-google-key';

    localRouter = new LocalRouter();
    const config: Config = { apiKey: 'test-api-key' };
    client = new IronaChatClient(config, localRouter);
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  // ── Model Selection (router only) ──────────────────────────────────────

  describe('Tier → Model mapping', () => {
    it('SIMPLE prompt → gpt-5-nano (cheapest)', async () => {
      const result = await localRouter.modelSelect({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.SIMPLE }],
      });
      expect(result.success).toBe(true);
      expect(result.providers[0]).toMatchObject({
        provider: 'openai',
        model: 'gpt-5-nano',
      });
      expect(result.message).toContain('SIMPLE');
    });

    it('MEDIUM prompt → gemini-3-flash-preview (2nd cheapest)', async () => {
      const result = await localRouter.modelSelect({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.MEDIUM }],
      });
      expect(result.success).toBe(true);
      expect(result.providers[0]).toMatchObject({
        provider: 'google',
        model: 'gemini-3-flash-preview',
      });
    });

    it('COMPLEX prompt → gpt-5.2-chat-latest (2nd most expensive)', async () => {
      const result = await localRouter.modelSelect({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.COMPLEX }],
      });
      expect(result.success).toBe(true);
      expect(result.providers[0]).toMatchObject({
        provider: 'openai',
        model: 'gpt-5.2-chat-latest',
      });
      expect(result.message).toContain('COMPLEX');
    });

    it('REASONING prompt → claude-sonnet-4-5 (most expensive reasoning-capable)', async () => {
      const result = await localRouter.modelSelect({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.REASONING }],
      });
      expect(result.success).toBe(true);
      expect(result.providers[0]).toMatchObject({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
      });
      expect(result.message).toContain('REASONING');
    });
  });

  // ── Completions through IronaChatClient ────────────────────────────────

  describe('End-to-end completions', () => {
    it('SIMPLE prompt → completions invoked with gpt-5-nano', async () => {
      setupGeneration('The answer is 4.');

      const result = await client.completions({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.SIMPLE }],
      });

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-5-nano');
      expect(result.response.content).toBe('The answer is 4.');
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it('MEDIUM prompt → completions invoked with gemini-3-flash', async () => {
      setupGeneration('Here is the function...');

      const result = await client.completions({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.MEDIUM }],
      });

      expect(result.provider).toBe('google');
      expect(result.model).toBe('gemini-3-flash-preview');
      expect(result.response.content).toBe('Here is the function...');
    });

    it('COMPLEX prompt → completions invoked with gpt-5.2', async () => {
      setupGeneration('Here is the architecture design...');

      const result = await client.completions({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.COMPLEX }],
      });

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-5.2-chat-latest');
      expect(result.response.content).toBe(
        'Here is the architecture design...'
      );
    });

    it('REASONING prompt → completions invoked with claude-sonnet-4-5', async () => {
      setupGeneration('Here is the formal proof...');

      const result = await client.completions({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.REASONING }],
      });

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-sonnet-4-5-20250929');
      expect(result.response.content).toBe('Here is the formal proof...');
    });

    it('SIMPLE prompt with streaming → streams via gpt-5-nano', async () => {
      setupStream(['Hi', ' there']);

      const result = await client.completions({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-5-nano');
      expect(result.response.fullStream).toBeDefined();
      expect(mockStreamText).toHaveBeenCalledTimes(1);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('single model bypasses local router classification', async () => {
      setupGeneration('Response from nano');

      const result = await client.completions({
        models: ['openai/gpt-5-nano'] as [string, ...string[]],
        messages: [{ role: 'user', content: PROMPTS.REASONING }],
      });

      // Even a REASONING prompt should use the single model directly
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-5-nano');
    });

    it('2-model setup: simple → cheap, reasoning → expensive', async () => {
      const twoModels: [string, ...string[]] = [
        'openai/gpt-5-nano',
        'anthropic/claude-sonnet-4-5-20250929',
      ];

      const simpleResult = await localRouter.modelSelect({
        models: twoModels,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(simpleResult.providers[0].model).toBe('gpt-5-nano');

      const reasoningResult = await localRouter.modelSelect({
        models: twoModels,
        messages: [{ role: 'user', content: PROMPTS.REASONING }],
      });
      expect(reasoningResult.providers[0].model).toBe(
        'claude-sonnet-4-5-20250929'
      );
    });

    it('includes fallback providers in response', async () => {
      const result = await localRouter.modelSelect({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(result.fallbackProviders).toBeDefined();
      expect(result.fallbackProviders.length).toBeGreaterThan(0);
    });

    it('response providers include cost and hasReasoning for observability', async () => {
      const result = await localRouter.modelSelect({
        models: ALL_FOUR_MODELS,
        messages: [{ role: 'user', content: PROMPTS.SIMPLE }],
      });
      const selected = result.providers[0] as any;
      expect(selected.provider).toBe('openai');
      expect(selected.model).toBe('gpt-5-nano');
      expect(typeof selected.cost).toBe('number');
      expect(typeof selected.hasReasoning).toBe('boolean');
    });
  });
});
