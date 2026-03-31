import { createOpenRouterFetchWrapper } from '../../../src/utils/openRouterFetchWrapper';
import type { OpenRouterExtraBody } from '../../../src/utils/openRouterMapper';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a minimal OpenAI-compatible non-streaming JSON response body. */
function nonStreamingBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello world',
          ...overrides,
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
}

/** Creates a mock fetch that returns a non-streaming JSON response. */
function createMockFetch(
  body: string,
  contentType = 'application/json'
): jest.Mock {
  return jest.fn().mockResolvedValue(
    new Response(body, {
      status: 200,
      headers: { 'content-type': contentType },
    })
  );
}

/** Builds SSE lines from an array of JSON chunk objects. */
function buildSSEBody(chunks: Array<Record<string, unknown>>): string {
  return (
    chunks.map(c => `data: ${JSON.stringify(c)}`).join('\n') +
    '\n\ndata: [DONE]\n'
  );
}

/** Creates a mock fetch that returns a streaming SSE response. */
function createStreamingMockFetch(sseBody: string): jest.Mock {
  return jest.fn().mockResolvedValue(
    new Response(sseBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  );
}

/** Reads a ReadableStream body to a string (for SSE responses). */
async function readStreamToString(
  body: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

async function callWrapper(
  extraBody: OpenRouterExtraBody,
  responseBody: string,
  contentType = 'application/json'
): Promise<Response> {
  const mockFetch = createMockFetch(responseBody, contentType);
  const wrapper = createOpenRouterFetchWrapper(extraBody, mockFetch);
  return wrapper('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'test', messages: [] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 1: Reasoning content was silently discarded (non-streaming)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Non-streaming reasoning injection', () => {
  it('injects <think> tags when message.reasoning is present', async () => {
    const body = nonStreamingBody({
      content: 'The answer is 555.',
      reasoning: 'Let me calculate 15 * 37 step by step...',
    });

    const response = await callWrapper({ reasoning: { effort: 'high' } }, body);
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string; reasoning?: string } }>;
    };

    // Reasoning should be injected as <think> tags in content
    expect(json.choices[0].message.content).toBe(
      '<think>Let me calculate 15 * 37 step by step...</think>The answer is 555.'
    );
    // The original reasoning field should be removed
    expect(json.choices[0].message.reasoning).toBeUndefined();
  });

  it('handles reasoning with empty content', async () => {
    const body = nonStreamingBody({
      content: '',
      reasoning: 'Thinking...',
    });

    const response = await callWrapper(
      { reasoning: { effort: 'medium' } },
      body
    );
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    expect(json.choices[0].message.content).toBe('<think>Thinking...</think>');
  });

  it('handles reasoning with no content field', async () => {
    const body = JSON.stringify({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            reasoning: 'Deep thought...',
          },
        },
      ],
    });

    const response = await callWrapper(
      { reasoning: { effort: 'medium' } },
      body
    );
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    expect(json.choices[0].message.content).toBe(
      '<think>Deep thought...</think>'
    );
  });

  it('does not modify response when no reasoning is present', async () => {
    const body = nonStreamingBody({ content: 'Plain response' });

    const response = await callWrapper({ reasoning: { effort: 'high' } }, body);
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    expect(json.choices[0].message.content).toBe('Plain response');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 2: Annotations were deleted instead of flattened
// ═══════════════════════════════════════════════════════════════════════════════

describe('Non-streaming annotation normalisation', () => {
  it('flattens nested url_citation objects instead of deleting them', async () => {
    const body = nonStreamingBody({
      content: 'Search result text',
      annotations: [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com',
            title: 'Example',
            start_index: 0,
            end_index: 18,
          },
        },
      ],
    });

    const response = await callWrapper({ plugins: [{ id: 'web' }] }, body);
    const json = (await response.json()) as {
      choices: Array<{
        message: {
          annotations: Array<{
            type: string;
            url: string;
            title: string;
            start_index: number;
            end_index: number;
            url_citation?: unknown;
          }>;
        };
      }>;
    };

    const ann = json.choices[0].message.annotations[0];
    // Fields should be flat at top level
    expect(ann.url).toBe('https://example.com');
    expect(ann.title).toBe('Example');
    expect(ann.start_index).toBe(0);
    expect(ann.end_index).toBe(18);
    // Nested sub-object should be removed
    expect(ann.url_citation).toBeUndefined();
    // Annotations array should still exist (not deleted!)
    expect(json.choices[0].message.annotations).toHaveLength(1);
  });

  it('preserves already-flat annotations unchanged', async () => {
    const body = nonStreamingBody({
      content: 'Already flat',
      annotations: [
        {
          type: 'url_citation',
          url: 'https://flat.example.com',
          title: 'Flat',
          start_index: 0,
          end_index: 12,
        },
      ],
    });

    const response = await callWrapper({ plugins: [{ id: 'web' }] }, body);
    const json = (await response.json()) as {
      choices: Array<{
        message: {
          annotations: Array<{ url: string; title: string }>;
        };
      }>;
    };

    expect(json.choices[0].message.annotations[0].url).toBe(
      'https://flat.example.com'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 3: Transforms were conditional on hasSearchPlugin
// ═══════════════════════════════════════════════════════════════════════════════

describe('Transforms always applied (not conditional on search)', () => {
  it('transforms reasoning response even when no search plugin is present', async () => {
    const body = nonStreamingBody({
      content: 'Result',
      reasoning: 'Thinking step by step...',
    });

    // extraBody has reasoning but NO plugins (no search)
    const response = await callWrapper(
      { reasoning: { effort: 'medium' } },
      body
    );
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string; reasoning?: string } }>;
    };

    // Even without search, reasoning should be injected
    expect(json.choices[0].message.content).toContain('<think>');
    expect(json.choices[0].message.reasoning).toBeUndefined();
  });

  it('transforms response even with empty extraBody', async () => {
    const body = nonStreamingBody({
      content: 'Plain',
      reasoning: 'Some reasoning',
    });

    // Empty extraBody — the old code would return response untouched
    const response = await callWrapper({}, body);
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    expect(json.choices[0].message.content).toBe(
      '<think>Some reasoning</think>Plain'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 5: Streaming reasoning with stateful <think> tag tracking
// ═══════════════════════════════════════════════════════════════════════════════

describe('Streaming reasoning injection', () => {
  it('injects <think> on first reasoning chunk and </think> before first content chunk', async () => {
    const chunks = [
      {
        choices: [{ index: 0, delta: { reasoning: 'Step 1: ' } }],
      },
      {
        choices: [{ index: 0, delta: { reasoning: 'Step 2. ' } }],
      },
      {
        choices: [{ index: 0, delta: { content: 'The answer is 42.' } }],
      },
    ];

    const sseBody = buildSSEBody(chunks);
    const mockFetch = createStreamingMockFetch(sseBody);
    const wrapper = createOpenRouterFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    const response = await wrapper(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'test', messages: [] }),
      }
    );

    const text = await readStreamToString(response.body!);

    // First reasoning chunk should have <think> prefix
    expect(text).toContain('<think>Step 1: ');
    // Second reasoning chunk should NOT have <think> prefix (already open)
    expect(text).toContain('Step 2. ');
    expect(text).not.toContain('<think>Step 2. ');
    // First content chunk should have </think> prefix
    expect(text).toContain('</think>The answer is 42.');
    // reasoning fields should be removed from deltas
    expect(text).not.toContain('"reasoning"');
  });

  it('handles reasoning-only stream (no content chunks)', async () => {
    const chunks = [
      {
        choices: [
          { index: 0, delta: { reasoning: 'All reasoning, no text.' } },
        ],
      },
    ];

    const sseBody = buildSSEBody(chunks);
    const mockFetch = createStreamingMockFetch(sseBody);
    const wrapper = createOpenRouterFetchWrapper(
      { reasoning: { effort: 'medium' } },
      mockFetch
    );

    const response = await wrapper(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'test', messages: [] }),
      }
    );

    const text = await readStreamToString(response.body!);

    expect(text).toContain('<think>All reasoning, no text.');
    expect(text).not.toContain('"reasoning"');
  });

  it('flattens nested annotations in streaming delta', async () => {
    const chunks = [
      {
        choices: [
          {
            index: 0,
            delta: {
              content: 'Source: ',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://stream.example.com',
                    title: 'Stream Source',
                    start_index: 0,
                    end_index: 7,
                  },
                },
              ],
            },
          },
        ],
      },
    ];

    const sseBody = buildSSEBody(chunks);
    const mockFetch = createStreamingMockFetch(sseBody);
    const wrapper = createOpenRouterFetchWrapper(
      { plugins: [{ id: 'web' }] },
      mockFetch
    );

    const response = await wrapper(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'test', messages: [] }),
      }
    );

    const text = await readStreamToString(response.body!);
    const parsed = JSON.parse(
      text
        .split('\n')
        .find(l => l.startsWith('data: {'))!
        .slice(6)
    ) as {
      choices: Array<{
        delta: {
          annotations: Array<{
            url: string;
            url_citation?: unknown;
          }>;
        };
      }>;
    };

    const ann = parsed.choices[0].delta.annotations[0];
    expect(ann.url).toBe('https://stream.example.com');
    expect(ann.url_citation).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug 4: buildOpenRouterExtraBody returning undefined → no fetch wrapper
// (Tested via the public wrapper API to verify transform is always applied)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Response transform applied regardless of extraBody contents', () => {
  it('transforms response body even when extraBody has only provider config', async () => {
    // This simulates the case where buildOpenRouterExtraBody returns
    // only { provider: { sort: 'latency' } } (no reasoning, no search)
    // but the response happens to contain reasoning (e.g. model natively reasons)
    const body = nonStreamingBody({
      content: 'Native reasoning response',
      reasoning: 'The model thought on its own.',
    });

    const response = await callWrapper(
      { provider: { sort: 'latency' } } as OpenRouterExtraBody,
      body
    );
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string; reasoning?: string } }>;
    };

    // Even with just provider config, the transform should process reasoning
    expect(json.choices[0].message.content).toContain('<think>');
    expect(json.choices[0].message.reasoning).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Combined: reasoning + search + annotations in same response
// ═══════════════════════════════════════════════════════════════════════════════

describe('Combined reasoning + annotations in single response', () => {
  it('handles both reasoning injection and annotation flattening', async () => {
    const body = nonStreamingBody({
      content: 'The population is about 1.4 billion.',
      reasoning: 'Let me search and reason about this.',
      annotations: [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://census.gov',
            title: 'Census Data',
            start_index: 0,
            end_index: 35,
          },
        },
      ],
    });

    const response = await callWrapper(
      {
        reasoning: { effort: 'medium' },
        plugins: [{ id: 'web' }],
      },
      body
    );
    const json = (await response.json()) as {
      choices: Array<{
        message: {
          content: string;
          reasoning?: string;
          annotations: Array<{ url: string; url_citation?: unknown }>;
        };
      }>;
    };

    // Reasoning injected
    expect(json.choices[0].message.content).toBe(
      '<think>Let me search and reason about this.</think>The population is about 1.4 billion.'
    );
    expect(json.choices[0].message.reasoning).toBeUndefined();

    // Annotations flattened
    expect(json.choices[0].message.annotations[0].url).toBe(
      'https://census.gov'
    );
    expect(json.choices[0].message.annotations[0].url_citation).toBeUndefined();
  });
});
