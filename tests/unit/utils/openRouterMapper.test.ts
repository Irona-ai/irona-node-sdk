import {
  mapReasoningToOpenRouter,
  mapSearchToOpenRouter,
  buildOpenRouterExtraBody,
} from '../../../src/utils/openRouterMapper';
import { createOpenRouterFetchWrapper } from '../../../src/utils/openRouterFetchWrapper';

// ── mapReasoningToOpenRouter ─────────────────────────────────────────────────

describe('mapReasoningToOpenRouter', () => {
  it('returns undefined when effort is undefined', () => {
    expect(mapReasoningToOpenRouter(undefined)).toBeUndefined();
  });

  it('maps "off" to { enabled: false }', () => {
    expect(mapReasoningToOpenRouter('off')).toEqual({ enabled: false });
  });

  it('maps "low" to { effort: "low" }', () => {
    expect(mapReasoningToOpenRouter('low')).toEqual({ effort: 'low' });
  });

  it('maps "medium" to { effort: "medium" }', () => {
    expect(mapReasoningToOpenRouter('medium')).toEqual({ effort: 'medium' });
  });

  it('maps "high" to { effort: "high" }', () => {
    expect(mapReasoningToOpenRouter('high')).toEqual({ effort: 'high' });
  });

  it('maps "max" to { effort: "xhigh" }', () => {
    expect(mapReasoningToOpenRouter('max')).toEqual({ effort: 'xhigh' });
  });
});

// ── mapSearchToOpenRouter ────────────────────────────────────────────────────

describe('mapSearchToOpenRouter', () => {
  it('returns undefined when search is undefined', () => {
    expect(mapSearchToOpenRouter(undefined, true)).toBeUndefined();
  });

  it('returns undefined when search is false', () => {
    expect(mapSearchToOpenRouter(false, true)).toBeUndefined();
  });

  it('returns undefined when model does not support web search', () => {
    expect(mapSearchToOpenRouter(true, false)).toBeUndefined();
  });

  it('returns plugins when search is true and supported', () => {
    expect(mapSearchToOpenRouter(true, true)).toEqual({
      plugins: [{ id: 'web' }],
    });
  });
});

// ── buildOpenRouterExtraBody ─────────────────────────────────────────────────

describe('buildOpenRouterExtraBody', () => {
  it('always includes provider sort by latency', () => {
    expect(buildOpenRouterExtraBody({ supportsWebSearch: false })).toEqual({
      provider: { sort: 'latency' },
    });
  });

  it('never returns undefined (regression: ensures fetch wrapper is always created)', () => {
    // Bug 4: buildOpenRouterExtraBody used to return undefined when no reasoning
    // or search was requested, which meant the fetch wrapper was never created
    // and provider sort preference was never sent.
    const result = buildOpenRouterExtraBody({
      reasoningEffort: undefined,
      search: undefined,
      supportsWebSearch: false,
    });
    expect(result).toBeDefined();
    expect(result).not.toBeUndefined();
    expect(result.provider).toEqual({ sort: 'latency' });
  });

  it('includes only provider config when reasoning is undefined and search is false', () => {
    expect(
      buildOpenRouterExtraBody({
        reasoningEffort: undefined,
        search: false,
        supportsWebSearch: true,
      })
    ).toEqual({
      provider: { sort: 'latency' },
    });
  });

  it('returns reasoning and provider when search is not requested', () => {
    expect(
      buildOpenRouterExtraBody({
        reasoningEffort: 'high',
        supportsWebSearch: false,
      })
    ).toEqual({
      provider: { sort: 'latency' },
      reasoning: { effort: 'high' },
    });
  });

  it('returns search params and provider when reasoning is undefined', () => {
    expect(
      buildOpenRouterExtraBody({
        search: true,
        supportsWebSearch: true,
      })
    ).toEqual({
      provider: { sort: 'latency' },
      plugins: [{ id: 'web' }],
    });
  });

  it('returns reasoning, search, and provider when both are requested', () => {
    expect(
      buildOpenRouterExtraBody({
        reasoningEffort: 'max',
        search: true,
        supportsWebSearch: true,
      })
    ).toEqual({
      provider: { sort: 'latency' },
      reasoning: { effort: 'xhigh' },
      plugins: [{ id: 'web' }],
    });
  });

  it('returns reasoning and provider for "off" effort (enabled: false)', () => {
    expect(
      buildOpenRouterExtraBody({
        reasoningEffort: 'off',
        supportsWebSearch: false,
      })
    ).toEqual({
      provider: { sort: 'latency' },
      reasoning: { enabled: false },
    });
  });
});

// ── createOpenRouterFetchWrapper ─────────────────────────────────────────────

describe('createOpenRouterFetchWrapper', () => {
  it('merges extra body into POST JSON requests', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createOpenRouterFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    const originalBody = JSON.stringify({ model: 'test', messages: [] });
    await wrapper('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: originalBody,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
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
    const wrapper = createOpenRouterFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    await wrapper('https://openrouter.ai/api/v1/models', {
      method: 'GET',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      {
        method: 'GET',
      }
    );
  });

  it('passes through POST requests with non-string body', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createOpenRouterFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    const formData = new FormData();
    await wrapper('https://openrouter.ai/api/v1/upload', {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/upload',
      {
        method: 'POST',
        body: formData,
      }
    );
  });

  it('passes through POST requests with invalid JSON body', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createOpenRouterFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    await wrapper('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: 'not json',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      { method: 'POST', body: 'not json' }
    );
  });

  it('merges multiple extra body keys', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createOpenRouterFetchWrapper(
      {
        reasoning: { effort: 'xhigh' },
        plugins: [{ id: 'web' }],
      },
      mockFetch
    );

    await wrapper('https://openrouter.ai/api/v1/chat/completions', {
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
      plugins: [{ id: 'web' }],
    });
  });

  it('uses globalThis.fetch by default when no baseFetch provided', () => {
    // Just verify the wrapper can be created without a baseFetch argument
    const wrapper = createOpenRouterFetchWrapper({
      reasoning: { effort: 'high' },
    });
    expect(typeof wrapper).toBe('function');
  });
});
