// Mocks MUST be before imports (critical Jest pattern for this codebase)
jest.mock('../../../src/supported_models', () => ({
  doesModelSupportMediaTypes: jest.fn().mockReturnValue(true),
  doesModelSupportWebSearch: jest.fn().mockReturnValue(false),
  isSupportedModel: jest.fn().mockReturnValue(true),
  getModelPrice: jest
    .fn()
    .mockImplementation((provider: string, model: string) => {
      const prices: Record<string, { input: number; output: number }> = {
        'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
        'openai/gpt-4o': { input: 5, output: 15 },
        'anthropic/claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
        'anthropic/claude-sonnet-4-5-20250929': { input: 3, output: 15 },
        'openai/o3': { input: 10, output: 40 },
      };
      return prices[`${provider}/${model}`] ?? null;
    }),
  getModelCapabilities: jest
    .fn()
    .mockImplementation((provider: string, model: string) => {
      const caps: Record<string, string[]> = {
        'openai/gpt-4o-mini': ['routing', 'image'],
        'openai/gpt-4o': ['routing', 'image', 'search'],
        'anthropic/claude-3-haiku-20240307': ['routing'],
        'anthropic/claude-sonnet-4-5-20250929': [
          'routing',
          'image',
          'reasoning',
        ],
        'openai/o3': ['routing', 'reasoning'],
      };
      return caps[`${provider}/${model}`] ?? null;
    }),
  providerApiKeyName: jest.fn().mockReturnValue('API_KEY'),
  getModelPrefix: jest.fn().mockReturnValue(null),
  getOpenRouterIdentifier: jest.fn().mockReturnValue(null),
  updateProvidersFromGist: jest.fn().mockResolvedValue(undefined),
}));

import { classifyByRules } from '../../../src/router/local/classifier';
import { DEFAULT_SCORING_CONFIG } from '../../../src/router/local/config';
import { LocalRouter } from '../../../src/router/local';
import { resolveRouterConfig } from '../../../src/router/factory';
import type { ScoringConfig } from '../../../src/router/types';

// ── Classifier Tests ─────────────────────────────────────────────────────────

describe('classifyByRules', () => {
  const config: ScoringConfig = DEFAULT_SCORING_CONFIG;

  it('classifies a simple question as SIMPLE tier', () => {
    const result = classifyByRules(
      'What is the capital of France?',
      undefined,
      10,
      config
    );
    expect(result.tier).toBe('SIMPLE');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies code prompt with reasoning as high tier', () => {
    const result = classifyByRules(
      'Implement a distributed database with kubernetes microservice architecture. ' +
        'Optimize the algorithm for infrastructure and design the deployment.',
      undefined,
      40,
      config
    );
    // With code + technical + imperative keywords, should be MEDIUM or higher
    expect(result.score).toBeGreaterThan(0);
  });

  it('classifies reasoning prompt as REASONING tier', () => {
    const result = classifyByRules(
      'Prove the theorem step by step using mathematical proof and derive the result logically',
      undefined,
      25,
      config
    );
    expect(result.tier).toBe('REASONING');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('scores technical prompts higher than simple ones', () => {
    const simpleResult = classifyByRules(
      'What is 2 + 2?',
      undefined,
      5,
      config
    );
    const complexResult = classifyByRules(
      'Design a distributed microservice architecture with kubernetes ' +
        'that handles database infrastructure optimization with algorithm analysis.',
      undefined,
      30,
      config
    );
    expect(complexResult.score).toBeGreaterThan(simpleResult.score);
  });

  it('detects agentic tasks', () => {
    const result = classifyByRules(
      'Read the file, then edit and deploy the code. Run the tests and fix any bugs.',
      undefined,
      30,
      config
    );
    expect(result.agenticScore).toBeDefined();
    expect(result.agenticScore!).toBeGreaterThan(0.5);
  });

  it('ignores system prompt reasoning keywords for tier classification', () => {
    const result = classifyByRules(
      'What is 2 + 2?',
      'Always reason step by step',
      10,
      config
    );
    expect(result.tier).not.toBe('REASONING');
  });

  it('returns signals for matching dimensions', () => {
    const result = classifyByRules(
      'Prove the theorem mathematically step by step',
      undefined,
      15,
      config
    );
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals.some(s => s.includes('reasoning'))).toBe(true);
  });
});

// ── LocalRouter Tests ────────────────────────────────────────────────────────

describe('LocalRouter', () => {
  const router = new LocalRouter();

  it('returns single model directly without classification', async () => {
    const result = await router.modelSelect({
      models: ['openai/gpt-4o-mini'],
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result.success).toBe(true);
    expect(result.providers[0].provider).toBe('openai');
    expect(result.providers[0].model).toBe('gpt-4o-mini');
    expect(result.message).toContain('Single model optimization');
  });

  it('selects cheapest model for simple prompts', async () => {
    const result = await router.modelSelect({
      models: [
        'openai/gpt-4o-mini',
        'openai/gpt-4o',
        'anthropic/claude-sonnet-4-5-20250929',
      ],
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });
    expect(result.success).toBe(true);
    // Should pick cheapest model for simple prompts
    expect(result.providers[0].model).toBe('gpt-4o-mini');
  });

  it('selects reasoning model for reasoning prompts', async () => {
    const result = await router.modelSelect({
      models: [
        'openai/gpt-4o-mini',
        'openai/o3',
        'anthropic/claude-sonnet-4-5-20250929',
      ],
      messages: [
        {
          role: 'user',
          content:
            'Prove the theorem step by step using mathematical proof and derive the result logically',
        },
      ],
    });
    expect(result.success).toBe(true);
    // Should pick a reasoning-capable model (o3 or claude-sonnet-4-5)
    const selected = result.providers[0];
    expect(['o3', 'claude-sonnet-4-5-20250929']).toContain(selected.model);
  });

  it('includes default fallback providers', async () => {
    const result = await router.modelSelect({
      models: ['openai/gpt-4o-mini', 'openai/gpt-4o'],
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result.fallbackProviders.length).toBeGreaterThan(0);
    expect(result.fallbackProviders[0].provider).toBe('openai');
    expect(result.fallbackProviders[0].model).toBe('gpt-4o-mini');
  });

  it('uses custom fallback models when provided', async () => {
    const result = await router.modelSelect({
      models: ['openai/gpt-4o-mini', 'openai/gpt-4o'],
      messages: [{ role: 'user', content: 'Hello' }],
      fallbackModels: ['anthropic/claude-3-haiku-20240307'],
    });
    expect(result.fallbackProviders[0].provider).toBe('anthropic');
    expect(result.fallbackProviders[0].model).toBe('claude-3-haiku-20240307');
  });

  it('selects most expensive model for COMPLEX tier', async () => {
    const result = await router.modelSelect({
      models: [
        'openai/gpt-4o-mini',
        'openai/gpt-4o',
        'anthropic/claude-sonnet-4-5-20250929',
      ],
      messages: [
        {
          role: 'user',
          content:
            'Design a distributed microservice architecture with kubernetes ' +
            'that handles database infrastructure optimization. Implement the algorithm ' +
            'for the distributed system with formal proof and step by step mathematical derivation.',
        },
      ],
    });
    expect(result.success).toBe(true);
    // For COMPLEX/REASONING tier, should pick most expensive or reasoning-capable model
    const selected = result.providers[0];
    expect(['gpt-4o', 'claude-sonnet-4-5-20250929']).toContain(selected.model);
  });
});

// ── Arcade Mode (topkModels) Tests ──────────────────────────────────────────

describe('LocalRouter arcade mode (topkModels)', () => {
  const router = new LocalRouter();
  const threeModels = [
    'openai/gpt-4o-mini', // cheapest  (cost: 0.15 + 3*0.6 = 1.95)
    'openai/gpt-4o', // mid       (cost: 5 + 3*15 = 50)
    'anthropic/claude-sonnet-4-5-20250929', // expensive (cost: 3 + 3*15 = 48)
  ];
  // Note: gpt-4o (50) > claude-sonnet (48) > gpt-4o-mini (1.95) by cost

  it('returns 2 models when topkModels is 2', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // 80% path
    const result = await router.modelSelect({
      models: threeModels as [string, ...string[]],
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      topkModels: 2,
    });
    expect(result.providers.length).toBe(2);
    jest.restoreAllMocks();
  });

  it('second model is stronger (higher tier) in the 80% path', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // force 80% path
    const result = await router.modelSelect({
      models: threeModels as [string, ...string[]],
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      topkModels: 2,
    });
    // Simple prompt → first model is cheapest (gpt-4o-mini)
    expect(result.providers[0].model).toBe('gpt-4o-mini');
    // Second model should be from MEDIUM tier (one above SIMPLE) — not gpt-4o-mini
    expect(result.providers[1].model).not.toBe('gpt-4o-mini');
    jest.restoreAllMocks();
  });

  it('second model is random in the 20% path', async () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValue(0.5); // first call < 0.2 → random path; second for index
    const result = await router.modelSelect({
      models: threeModels as [string, ...string[]],
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      topkModels: 2,
    });
    expect(result.providers.length).toBe(2);
    // Second model should not be the same as first
    expect(result.providers[1].model).not.toBe(result.providers[0].model);
    jest.restoreAllMocks();
  });

  it('at REASONING tier, second model is from COMPLEX (one below)', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // 80% path
    const result = await router.modelSelect({
      models: [
        'openai/gpt-4o-mini',
        'openai/o3',
        'anthropic/claude-sonnet-4-5-20250929',
      ] as [string, ...string[]],
      messages: [
        {
          role: 'user',
          content:
            'Prove the theorem step by step using mathematical proof and derive the result logically',
        },
      ],
      topkModels: 2,
    });
    // REASONING prompt → first should be reasoning-capable (o3 or claude-sonnet)
    const first = result.providers[0];
    expect(['o3', 'claude-sonnet-4-5-20250929']).toContain(first.model);
    // Second model should be different from first
    expect(result.providers[1].model).not.toBe(first.model);
    jest.restoreAllMocks();
  });

  it('returns 1 model with topkModels=2 when only 1 candidate model', async () => {
    const result = await router.modelSelect({
      models: ['openai/gpt-4o-mini'],
      messages: [{ role: 'user', content: 'Hello' }],
      topkModels: 2,
    });
    // Single model optimization — only 1 candidate, can't pick a second
    expect(result.providers.length).toBe(1);
  });

  it('returns both models with 2 candidates and topkModels=2', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // 80% path
    const result = await router.modelSelect({
      models: ['openai/gpt-4o-mini', 'openai/gpt-4o'] as [string, ...string[]],
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      topkModels: 2,
    });
    expect(result.providers.length).toBe(2);
    expect(result.providers[0].model).not.toBe(result.providers[1].model);
    jest.restoreAllMocks();
  });

  it('returns 1 model when topkModels is 1 or undefined', async () => {
    const result1 = await router.modelSelect({
      models: threeModels as [string, ...string[]],
      messages: [{ role: 'user', content: 'Hello' }],
      topkModels: 1,
    });
    expect(result1.providers.length).toBe(1);

    const result2 = await router.modelSelect({
      models: threeModels as [string, ...string[]],
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result2.providers.length).toBe(1);
  });
});

// ── Router Config Resolution Tests ───────────────────────────────────────────

describe('resolveRouterConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null (Irona default) when no config provided', () => {
    const config = resolveRouterConfig();
    expect(config).toBeNull();
  });

  it('returns explicit config when provided', () => {
    const config = resolveRouterConfig({ type: 'local' });
    expect(config).not.toBeNull();
    expect(config!.type).toBe('local');
  });

  it('resolves API router from env vars', () => {
    process.env.ROUTER_TYPE = 'api';
    process.env.ROUTER_BASE_URL = 'https://example.com/v2/router';
    process.env.ROUTER_API_KEY = 'test_key';
    process.env.ROUTER_ENDPOINT = '/modelSelect';

    const config = resolveRouterConfig();
    expect(config).not.toBeNull();
    expect(config!.type).toBe('api');
    if (config?.type === 'api') {
      expect(config.baseUrl).toBe('https://example.com/v2/router');
      expect(config.apiKey).toBe('test_key');
      expect(config.endpoint).toBe('/modelSelect');
    }
  });

  it('resolves local router from env var', () => {
    process.env.ROUTER_TYPE = 'local';
    const config = resolveRouterConfig();
    expect(config).not.toBeNull();
    expect(config!.type).toBe('local');
  });

  it('throws if API router env vars are incomplete', () => {
    process.env.ROUTER_TYPE = 'api';
    process.env.ROUTER_BASE_URL = 'https://example.com';
    delete process.env.ROUTER_API_KEY;

    expect(() => resolveRouterConfig()).toThrow(
      'ROUTER_BASE_URL and ROUTER_API_KEY'
    );
  });
});
