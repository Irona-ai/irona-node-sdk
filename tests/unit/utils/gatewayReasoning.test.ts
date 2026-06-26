import axios from 'axios';

import {
  genericGatewayReasoning,
  getProviderReasoningPolicy,
  resolveGatewayReasoning,
  updateGatewayReasoningConfig,
} from '../../../src/utils/gatewayReasoning';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mirrors the v3.1 reasoningConfig shape the SDK fetches at runtime.
const TEST_CONFIG = {
  version: '3.1',
  effort_budget_ratios: {
    none: 0.0,
    minimal: 0.1,
    low: 0.25,
    medium: 0.5,
    high: 0.85,
    xhigh: 1.0,
  },
  budget_clamp: { min: 1024, max: 64000 },
  providers: {
    openai: {
      supported_efforts: ['xhigh', 'high', 'medium', 'low', 'minimal'],
      default_effort: 'medium',
      default_enabled: true,
      supports_max_tokens: false,
      mandatory: false,
    },
    anthropic: {
      supported_efforts: ['xhigh', 'high', 'medium', 'low'],
      default_effort: 'medium',
      default_enabled: false,
      supports_max_tokens: true,
      max_budget: 64000,
      mandatory: false,
    },
    google: {
      supported_efforts: ['xhigh', 'high', 'medium', 'low'],
      default_effort: 'medium',
      default_enabled: true,
      supports_max_tokens: false,
      mandatory: false,
    },
    xai: {
      supported_efforts: ['xhigh', 'high', 'low'],
      default_effort: 'high',
      default_enabled: true,
      supports_max_tokens: false,
      mandatory: false,
    },
    moonshotai: {
      supported_efforts: null,
      default_effort: null,
      default_enabled: true,
      supports_max_tokens: false,
      mandatory: false,
    },
    deepseek: {
      supported_efforts: ['xhigh', 'high', 'medium', 'low'],
      default_effort: 'medium',
      default_enabled: true,
      supports_max_tokens: false,
      mandatory: false,
    },
    xiaomi: {
      supported_efforts: null,
      default_effort: null,
      default_enabled: true,
      supports_max_tokens: false,
      mandatory: false,
    },
    'z-ai': {
      supported_efforts: null,
      default_effort: null,
      default_enabled: true,
      supports_max_tokens: false,
      mandatory: false,
    },
  },
};

beforeAll(async () => {
  mockedAxios.get.mockResolvedValue({ data: TEST_CONFIG });
  await updateGatewayReasoningConfig(
    'https://test.example/reasoning_config.json'
  );
});

// ── genericGatewayReasoning (no provider policy) ─────────────────────────────

describe('genericGatewayReasoning', () => {
  it('returns undefined for undefined and "off"', () => {
    expect(genericGatewayReasoning(undefined)).toBeUndefined();
    expect(genericGatewayReasoning('off')).toBeUndefined();
  });

  it('passes low/medium/high through unchanged', () => {
    expect(genericGatewayReasoning('low')).toEqual({ effort: 'low' });
    expect(genericGatewayReasoning('medium')).toEqual({ effort: 'medium' });
    expect(genericGatewayReasoning('high')).toEqual({ effort: 'high' });
  });

  it('applies the wire alias for "max" (max -> xhigh)', () => {
    expect(genericGatewayReasoning('max')).toEqual({ effort: 'xhigh' });
  });
});

// ── getProviderReasoningPolicy ───────────────────────────────────────────────

describe('getProviderReasoningPolicy', () => {
  it('returns the effort-based policy for openai', () => {
    const policy = getProviderReasoningPolicy('openai');
    expect(policy).toMatchObject({
      supports_max_tokens: false,
      default_enabled: true,
    });
    expect(policy?.supported_efforts).toContain('high');
  });

  it('returns the budget-based policy for anthropic (max_budget 64000)', () => {
    const policy = getProviderReasoningPolicy('anthropic');
    expect(policy).toMatchObject({
      supports_max_tokens: true,
      default_enabled: false,
      max_budget: 64000,
    });
  });

  it('returns undefined for an unknown / missing provider', () => {
    expect(getProviderReasoningPolicy('nope')).toBeUndefined();
    expect(getProviderReasoningPolicy(undefined)).toBeUndefined();
  });
});

// ── resolveGatewayReasoning ──────────────────────────────────────────────────

describe('resolveGatewayReasoning', () => {
  it('falls back to generic passthrough for providers without a policy', () => {
    expect(resolveGatewayReasoning('high', 'nope')).toEqual({ effort: 'high' });
    expect(resolveGatewayReasoning('max', 'nope')).toEqual({ effort: 'xhigh' });
    expect(resolveGatewayReasoning('off', 'nope')).toBeUndefined();
  });

  it('falls back to generic passthrough when provider is omitted', () => {
    expect(resolveGatewayReasoning('high')).toEqual({ effort: 'high' });
    expect(resolveGatewayReasoning('off')).toBeUndefined();
  });

  it('omits reasoning for "off"/undefined on known providers', () => {
    expect(resolveGatewayReasoning('off', 'openai')).toBeUndefined();
    expect(resolveGatewayReasoning(undefined, 'openai')).toBeUndefined();
    expect(resolveGatewayReasoning('off', 'anthropic')).toBeUndefined();
  });

  describe('effort-based providers', () => {
    it('sends the wire effort for openai', () => {
      expect(resolveGatewayReasoning('low', 'openai')).toEqual({
        effort: 'low',
      });
      expect(resolveGatewayReasoning('high', 'openai')).toEqual({
        effort: 'high',
      });
      expect(resolveGatewayReasoning('max', 'openai')).toEqual({
        effort: 'xhigh',
      });
    });

    it('passes effort through for providers without a discrete selector (z-ai)', () => {
      expect(resolveGatewayReasoning('high', 'z-ai')).toEqual({
        effort: 'high',
      });
      expect(resolveGatewayReasoning('max', 'z-ai')).toEqual({
        effort: 'xhigh',
      });
    });

    it('clamps an unsupported effort onto the nearest supported one (rounding up)', () => {
      // xai supports [xhigh, high, low] — "medium" is unsupported and sits
      // equidistant from low and high, so it rounds up to high.
      expect(resolveGatewayReasoning('medium', 'xai')).toEqual({
        effort: 'high',
      });
      // "low" is supported and passes through unchanged.
      expect(resolveGatewayReasoning('low', 'xai')).toEqual({ effort: 'low' });
    });
  });

  describe('budget-based providers (supports_max_tokens)', () => {
    it('computes max_tokens from max_budget * effort_budget_ratios (anthropic, budget 64000)', () => {
      expect(resolveGatewayReasoning('low', 'anthropic')).toEqual({
        max_tokens: 16000, // 64000 * 0.25
      });
      expect(resolveGatewayReasoning('medium', 'anthropic')).toEqual({
        max_tokens: 32000, // 64000 * 0.5
      });
      expect(resolveGatewayReasoning('high', 'anthropic')).toEqual({
        max_tokens: 54400, // 64000 * 0.85
      });
      expect(resolveGatewayReasoning('max', 'anthropic')).toEqual({
        max_tokens: 64000, // 64000 * 1.0, clamped to budget_clamp.max
      });
    });

    it('never sends an effort field for budget-based providers', () => {
      const r = resolveGatewayReasoning('high', 'anthropic');
      expect(r).toBeDefined();
      expect(r?.effort).toBeUndefined();
    });
  });
});
