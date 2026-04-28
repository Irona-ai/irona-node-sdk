import {
  mapReasoningToLLMGateway,
  mapSearchToLLMGateway,
  buildLLMGatewayExtraBody,
} from '../../../src/utils/llmGatewayMapper';
import { createLLMGatewayFetchWrapper } from '../../../src/utils/llmGatewayFetchWrapper';

// ── mapReasoningToLLMGateway ─────────────────────────────────────────────────

describe('mapReasoningToLLMGateway', () => {
  it('returns undefined when effort is undefined', () => {
    expect(mapReasoningToLLMGateway(undefined)).toBeUndefined();
  });

  it('maps "off" to undefined (omit the field so models use their own default)', () => {
    expect(mapReasoningToLLMGateway('off')).toBeUndefined();
  });

  it('maps "low" to { effort: "low" }', () => {
    expect(mapReasoningToLLMGateway('low')).toEqual({ effort: 'low' });
  });

  it('maps "medium" to { effort: "medium" }', () => {
    expect(mapReasoningToLLMGateway('medium')).toEqual({ effort: 'medium' });
  });

  it('maps "high" to { effort: "high" }', () => {
    expect(mapReasoningToLLMGateway('high')).toEqual({ effort: 'high' });
  });

  it('maps "max" to { effort: "xhigh" }', () => {
    expect(mapReasoningToLLMGateway('max')).toEqual({ effort: 'xhigh' });
  });
});

// ── mapSearchToLLMGateway ────────────────────────────────────────────────────

describe('mapSearchToLLMGateway', () => {
  it('returns undefined when search is undefined', () => {
    expect(mapSearchToLLMGateway(undefined, true)).toBeUndefined();
  });

  it('returns undefined when search is false', () => {
    expect(mapSearchToLLMGateway(false, true)).toBeUndefined();
  });

  it('returns undefined when model does not support web search', () => {
    expect(mapSearchToLLMGateway(true, false)).toBeUndefined();
  });

  it('returns web_search tool when search is true and supported', () => {
    expect(mapSearchToLLMGateway(true, true)).toEqual([{ type: 'web_search' }]);
  });
});

// ── buildLLMGatewayExtraBody ─────────────────────────────────────────────────

describe('buildLLMGatewayExtraBody', () => {
  it('returns empty object when no features are requested', () => {
    expect(buildLLMGatewayExtraBody({ supportsWebSearch: false })).toEqual({});
  });

  it('never returns undefined', () => {
    const result = buildLLMGatewayExtraBody({
      reasoningEffort: undefined,
      search: undefined,
      supportsWebSearch: false,
    });
    expect(result).toBeDefined();
    expect(result).not.toBeUndefined();
  });

  it('returns empty object when reasoning is undefined and search is false', () => {
    expect(
      buildLLMGatewayExtraBody({
        reasoningEffort: undefined,
        search: false,
        supportsWebSearch: true,
      })
    ).toEqual({});
  });

  it('returns reasoning when search is not requested', () => {
    expect(
      buildLLMGatewayExtraBody({
        reasoningEffort: 'high',
        supportsWebSearch: false,
      })
    ).toEqual({
      reasoning: { effort: 'high' },
    });
  });

  it('returns tools when search is requested', () => {
    expect(
      buildLLMGatewayExtraBody({
        search: true,
        supportsWebSearch: true,
      })
    ).toEqual({
      tools: [{ type: 'web_search' }],
    });
  });

  it('returns reasoning and tools when both are requested', () => {
    expect(
      buildLLMGatewayExtraBody({
        reasoningEffort: 'max',
        search: true,
        supportsWebSearch: true,
      })
    ).toEqual({
      reasoning: { effort: 'xhigh' },
      tools: [{ type: 'web_search' }],
    });
  });

  it('returns empty object for "off" effort (reasoning omitted)', () => {
    expect(
      buildLLMGatewayExtraBody({
        reasoningEffort: 'off',
        supportsWebSearch: false,
      })
    ).toEqual({});
  });
});

// ── createLLMGatewayFetchWrapper ─────────────────────────────────────────────

describe('createLLMGatewayFetchWrapper', () => {
  it('merges extra body into POST JSON requests', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createLLMGatewayFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    const originalBody = JSON.stringify({ model: 'test', messages: [] });
    await wrapper('https://api.llmgateway.io/v1/chat/completions', {
      method: 'POST',
      body: originalBody,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.llmgateway.io/v1/chat/completions');
    const parsedBody = JSON.parse(init.body as string) as Record<
      string,
      unknown
    >;
    expect(parsedBody).toEqual({
      model: 'test',
      messages: [],
      reasoning: { effort: 'high' },
    });
  });

  it('passes through GET requests unchanged', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createLLMGatewayFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    await wrapper('https://api.llmgateway.io/v1/models', {
      method: 'GET',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.llmgateway.io/v1/models',
      {
        method: 'GET',
      }
    );
  });

  it('passes through POST requests with non-string body', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createLLMGatewayFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    const formData = new FormData();
    await wrapper('https://api.llmgateway.io/v1/upload', {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.llmgateway.io/v1/upload',
      {
        method: 'POST',
        body: formData,
      }
    );
  });

  it('passes through POST requests with invalid JSON body', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createLLMGatewayFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    await wrapper('https://api.llmgateway.io/v1/chat/completions', {
      method: 'POST',
      body: 'not json',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.llmgateway.io/v1/chat/completions',
      { method: 'POST', body: 'not json' }
    );
  });

  it('merges multiple extra body keys including web_search tools', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createLLMGatewayFetchWrapper(
      {
        reasoning: { effort: 'xhigh' },
        tools: [{ type: 'web_search' }],
      },
      mockFetch
    );

    await wrapper('https://api.llmgateway.io/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'test', messages: [] }),
    });

    const parsedBody = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    ) as Record<string, unknown>;
    expect(parsedBody).toEqual({
      model: 'test',
      messages: [],
      reasoning: { effort: 'xhigh' },
      tools: [{ type: 'web_search' }],
    });
  });

  it('uses globalThis.fetch by default when no baseFetch provided', () => {
    const wrapper = createLLMGatewayFetchWrapper({
      reasoning: { effort: 'high' },
    });
    expect(typeof wrapper).toBe('function');
  });
});
