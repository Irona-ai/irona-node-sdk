// Mocks MUST be registered before source code is imported (see CLAUDE.md).
jest.mock('axios');
import axios from 'axios';

import {
  genericGatewayReasoning,
  getModelReasoningPolicy,
  resolveGatewayReasoning,
  updateGatewayReasoningConfig,
} from '../../../src/utils/gatewayReasoning';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const TEST_CONFIG = {
  effort_budget_ratios: {
    none: 0,
    minimal: 0.1,
    low: 0.25,
    medium: 0.5,
    high: 0.85,
    xhigh: 1.0,
  },
  budget_clamp: { min: 1024, max: 100000 },
  providers: {
    openai: {
      models: {
        'gpt-5.4': {
          supported_efforts: ['low', 'medium', 'high', 'xhigh'],
          supports_max_tokens: false,
          default_enabled: true,
        },
      },
    },
    anthropic: {
      models: {
        'claude-sonnet-4-6': {
          supported_efforts: null,
          supports_max_tokens: true,
          default_enabled: false,
          max_budget: 64000,
        },
        'claude-opus-4-6': {
          supported_efforts: null,
          supports_max_tokens: true,
          default_enabled: false,
          max_budget: 32000,
        },
      },
    },
    xai: {
      models: {
        'grok-4.3': {
          supported_efforts: ['xhigh', 'high', 'low'],
          supports_max_tokens: false,
          default_enabled: true,
        },
      },
    },
  },
};

beforeAll(async () => {
  mockedAxios.get.mockResolvedValueOnce({ data: TEST_CONFIG });
  await updateGatewayReasoningConfig('https://test.example.com/config.json');
});

// ── updateGatewayReasoningConfig (timeout + payload validation) ───────────────

describe('updateGatewayReasoningConfig', () => {
  it('passes a network timeout to axios', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: TEST_CONFIG });
    await updateGatewayReasoningConfig('https://test.example.com/config.json');
    expect(mockedAxios.get).toHaveBeenLastCalledWith(
      'https://test.example.com/config.json',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it('rejects a malformed payload (missing required keys)', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { nope: true } });
    await expect(
      updateGatewayReasoningConfig('https://test.example.com/bad.json')
    ).rejects.toThrow('malformed');
  });

  it('rejects a CDN error page (HTML string body)', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: '<html>404</html>' });
    await expect(
      updateGatewayReasoningConfig('https://test.example.com/404.html')
    ).rejects.toThrow();
  });
});

// ── genericGatewayReasoning ───────────────────────────────────────────────────

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

  it('passes "xhigh" through as "xhigh" on the wire', () => {
    expect(genericGatewayReasoning('xhigh')).toEqual({ effort: 'xhigh' });
  });
});

// ── getModelReasoningPolicy ───────────────────────────────────────────────────

describe('getModelReasoningPolicy', () => {
  it('returns the effort-based policy for a known openai model', () => {
    const policy = getModelReasoningPolicy('openai', 'gpt-5.4');
    expect(policy).toMatchObject({
      supports_max_tokens: false,
      default_enabled: true,
    });
    expect(policy?.supported_efforts).toContain('high');
  });

  it('returns the budget-based policy for a known anthropic model', () => {
    const policy = getModelReasoningPolicy('anthropic', 'claude-sonnet-4-6');
    expect(policy).toMatchObject({
      supports_max_tokens: true,
      default_enabled: false,
      max_budget: 64000,
    });
  });

  it('returns undefined for an unknown provider or model', () => {
    expect(getModelReasoningPolicy('nope', 'nope')).toBeUndefined();
    expect(getModelReasoningPolicy(undefined, 'gpt-5.4')).toBeUndefined();
    expect(getModelReasoningPolicy('openai', undefined)).toBeUndefined();
    expect(getModelReasoningPolicy('openai', 'unknown-model')).toBeUndefined();
  });
});

// ── resolveGatewayReasoning ──────────────────────────────────────────────────

describe('resolveGatewayReasoning', () => {
  it('falls back to generic passthrough when no provider/model given', () => {
    expect(resolveGatewayReasoning('high')).toEqual({ effort: 'high' });
    expect(resolveGatewayReasoning('xhigh')).toEqual({ effort: 'xhigh' });
    expect(resolveGatewayReasoning('off')).toBeUndefined();
  });

  it('falls back to generic passthrough for unknown provider/model', () => {
    expect(resolveGatewayReasoning('high', 'nope', 'nope')).toEqual({
      effort: 'high',
    });
    expect(resolveGatewayReasoning('xhigh', 'nope', 'nope')).toEqual({
      effort: 'xhigh',
    });
  });

  it('omits reasoning for "off"/undefined on known models', () => {
    expect(resolveGatewayReasoning('off', 'openai', 'gpt-5.4')).toBeUndefined();
    expect(
      resolveGatewayReasoning(undefined, 'openai', 'gpt-5.4')
    ).toBeUndefined();
    expect(
      resolveGatewayReasoning('off', 'anthropic', 'claude-sonnet-4-6')
    ).toBeUndefined();
  });

  describe('effort-based models', () => {
    it('sends the wire effort for openai/gpt-5.4', () => {
      expect(resolveGatewayReasoning('low', 'openai', 'gpt-5.4')).toEqual({
        effort: 'low',
      });
      expect(resolveGatewayReasoning('high', 'openai', 'gpt-5.4')).toEqual({
        effort: 'high',
      });
      expect(resolveGatewayReasoning('xhigh', 'openai', 'gpt-5.4')).toEqual({
        effort: 'xhigh',
      });
    });

    it('clamps an unsupported effort to the nearest supported one (rounding up)', () => {
      // xai/grok-4.3 supports [xhigh, high, low] — "medium" is equidistant
      // from low and high, so it rounds up to high.
      expect(resolveGatewayReasoning('medium', 'xai', 'grok-4.3')).toEqual({
        effort: 'high',
      });
      expect(resolveGatewayReasoning('low', 'xai', 'grok-4.3')).toEqual({
        effort: 'low',
      });
    });
  });

  describe('budget-based models (supports_max_tokens)', () => {
    it('computes max_tokens for anthropic/claude-sonnet-4-6 (max_budget 64000)', () => {
      expect(
        resolveGatewayReasoning('low', 'anthropic', 'claude-sonnet-4-6')
      ).toEqual({ max_tokens: 16000 }); // 64000 * 0.25
      expect(
        resolveGatewayReasoning('medium', 'anthropic', 'claude-sonnet-4-6')
      ).toEqual({ max_tokens: 32000 }); // 64000 * 0.5
      expect(
        resolveGatewayReasoning('high', 'anthropic', 'claude-sonnet-4-6')
      ).toEqual({ max_tokens: 54400 }); // 64000 * 0.85
      expect(
        resolveGatewayReasoning('xhigh', 'anthropic', 'claude-sonnet-4-6')
      ).toEqual({ max_tokens: 64000 }); // 64000 * 1.0, clamped to budget_clamp.max
    });

    it('computes max_tokens for anthropic/claude-opus-4-6 (max_budget 32000)', () => {
      expect(
        resolveGatewayReasoning('medium', 'anthropic', 'claude-opus-4-6')
      ).toEqual({ max_tokens: 16000 }); // 32000 * 0.5
      expect(
        resolveGatewayReasoning('xhigh', 'anthropic', 'claude-opus-4-6')
      ).toEqual({ max_tokens: 32000 }); // 32000 * 1.0
    });

    it('never sends an effort field for budget-based models', () => {
      const r = resolveGatewayReasoning(
        'high',
        'anthropic',
        'claude-sonnet-4-6'
      );
      expect(r).toBeDefined();
      expect(r?.effort).toBeUndefined();
    });
  });
});
