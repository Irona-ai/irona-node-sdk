import { createLLMGatewayFetchWrapper } from '../../../src/utils/llmGatewayFetchWrapper';
import type { LLMGatewayExtraBody } from '../../../src/utils/llmGatewayMapper';

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
  extraBody: LLMGatewayExtraBody,
  responseBody: string,
  contentType = 'application/json'
): Promise<Response> {
  const mockFetch = createMockFetch(responseBody, contentType);
  const wrapper = createLLMGatewayFetchWrapper(extraBody, mockFetch);
  return wrapper('https://api.llmgateway.io/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'test', messages: [] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Non-streaming reasoning injection
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

    expect(json.choices[0].message.content).toBe(
      '<think>Let me calculate 15 * 37 step by step...</think>The answer is 555.'
    );
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
// Transforms always applied (not conditional on search)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Transforms always applied (not conditional on search)', () => {
  it('transforms reasoning response even when no search plugin is present', async () => {
    const body = nonStreamingBody({
      content: 'Result',
      reasoning: 'Thinking step by step...',
    });

    const response = await callWrapper(
      { reasoning: { effort: 'medium' } },
      body
    );
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string; reasoning?: string } }>;
    };

    expect(json.choices[0].message.content).toContain('<think>');
    expect(json.choices[0].message.reasoning).toBeUndefined();
  });

  it('drops reasoning with empty extraBody (injectReasoning=false)', async () => {
    const body = nonStreamingBody({
      content: 'Plain',
      reasoning: 'Some reasoning',
    });

    const response = await callWrapper({}, body);
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string; reasoning?: string } }>;
    };

    expect(json.choices[0].message.content).toBe('Plain');
    expect(json.choices[0].message.reasoning).toBeUndefined();
  });

  it('drops reasoning when extraBody has no reasoning config', async () => {
    const body = nonStreamingBody({
      content: 'Native reasoning response',
      reasoning: 'The model thought on its own.',
    });

    const response = await callWrapper({}, body);
    const json = (await response.json()) as {
      choices: Array<{ message: { content: string; reasoning?: string } }>;
    };

    expect(json.choices[0].message.content).toBe('Native reasoning response');
    expect(json.choices[0].message.reasoning).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Streaming reasoning with stateful <think> tag tracking
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
    const wrapper = createLLMGatewayFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    const response = await wrapper(
      'https://api.llmgateway.io/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'test', messages: [] }),
      }
    );

    const text = await readStreamToString(response.body!);

    expect(text).toContain('<think>Step 1: ');
    expect(text).toContain('Step 2. ');
    expect(text).not.toContain('<think>Step 2. ');
    expect(text).toContain('</think>The answer is 42.');
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
    const wrapper = createLLMGatewayFetchWrapper(
      { reasoning: { effort: 'medium' } },
      mockFetch
    );

    const response = await wrapper(
      'https://api.llmgateway.io/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'test', messages: [] }),
      }
    );

    const text = await readStreamToString(response.body!);

    expect(text).toContain('<think>All reasoning, no text.');
    expect(text).not.toContain('"reasoning"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Combined: reasoning + search in same response
// ═══════════════════════════════════════════════════════════════════════════════

describe('Combined reasoning + search in single response', () => {
  it('handles reasoning injection with web search tools', async () => {
    const body = nonStreamingBody({
      content: 'The population is about 1.4 billion.',
      reasoning: 'Let me search and reason about this.',
    });

    const response = await callWrapper(
      {
        reasoning: { effort: 'medium' },
        tools: [{ type: 'web_search' }],
      },
      body
    );
    const json = (await response.json()) as {
      choices: Array<{
        message: {
          content: string;
          reasoning?: string;
        };
      }>;
    };

    expect(json.choices[0].message.content).toBe(
      '<think>Let me search and reason about this.</think>The population is about 1.4 billion.'
    );
    expect(json.choices[0].message.reasoning).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Web search: tools merging and annotation normalisation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Web search tools merging', () => {
  it('injects web_search tool when request has no existing tools', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createLLMGatewayFetchWrapper(
      { tools: [{ type: 'web_search' }] },
      mockFetch
    );

    await wrapper('https://api.llmgateway.io/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'grok-4-fast', messages: [] }),
    });

    const sent = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    ) as Record<string, unknown>;
    expect(sent.tools).toEqual([{ type: 'web_search' }]);
  });

  it('merges web_search tool with existing function-calling tools', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createLLMGatewayFetchWrapper(
      { tools: [{ type: 'web_search' }] },
      mockFetch
    );

    const fnTool = { type: 'function', function: { name: 'get_weather' } };
    await wrapper('https://api.llmgateway.io/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'grok-4-fast',
        messages: [],
        tools: [fnTool],
      }),
    });

    const sent = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    ) as Record<string, unknown>;
    expect(sent.tools).toEqual([fnTool, { type: 'web_search' }]);
  });

  it('does not send tools key when search is not requested', async () => {
    const mockFetch = jest.fn().mockResolvedValue(new Response('ok'));
    const wrapper = createLLMGatewayFetchWrapper(
      { reasoning: { effort: 'high' } },
      mockFetch
    );

    await wrapper('https://api.llmgateway.io/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'test', messages: [] }),
    });

    const sent = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    ) as Record<string, unknown>;
    expect(sent).not.toHaveProperty('tools');
  });
});

describe('Non-streaming annotation normalisation', () => {
  it('normalises flat message.annotations in non-streaming response', async () => {
    const body = JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'The weather is nice.',
            annotations: [
              {
                type: 'url_citation',
                url: 'https://example.com',
                title: 'Example',
              },
            ],
          },
          finish_reason: 'stop',
        },
      ],
    });

    const response = await callWrapper({}, body);
    const json = (await response.json()) as {
      choices: Array<{ message: { annotations: unknown[] } }>;
    };
    const annotation = json.choices[0].message.annotations[0] as Record<
      string,
      unknown
    >;

    expect(annotation.type).toBe('url_citation');
    expect(annotation.url).toBe('https://example.com');
    expect(annotation.start_index).toBe(0);
    expect(annotation.end_index).toBe(0);
  });

  it('normalises nested url_citation format in non-streaming response (Google/Gemini)', async () => {
    const body = JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'The weather is nice.',
            annotations: [
              {
                type: 'url_citation',
                url_citation: { url: 'https://weather.com', title: 'Weather' },
              },
            ],
          },
          finish_reason: 'stop',
        },
      ],
    });

    const response = await callWrapper({}, body);
    const json = (await response.json()) as {
      choices: Array<{ message: { annotations: unknown[] } }>;
    };
    const annotation = json.choices[0].message.annotations[0] as Record<
      string,
      unknown
    >;

    expect(annotation.url).toBe('https://weather.com');
    expect(annotation.title).toBe('Weather');
    expect(annotation).not.toHaveProperty('url_citation');
  });
});

describe('Annotation normalisation for sources', () => {
  it('normalises flat delta.annotations missing start_index/end_index', async () => {
    const chunks = [
      {
        choices: [
          {
            index: 0,
            delta: {
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://example.com',
                  title: 'Example',
                },
              ],
            },
          },
        ],
      },
    ];

    const sseBody = buildSSEBody(chunks);
    const mockFetch = createStreamingMockFetch(sseBody);
    const wrapper = createLLMGatewayFetchWrapper({}, mockFetch);

    const response = await wrapper(
      'https://api.llmgateway.io/v1/chat/completions',
      { method: 'POST', body: JSON.stringify({ model: 'test', messages: [] }) }
    );

    const text = await readStreamToString(response.body!);
    expect(text).toContain('"start_index":0');
    expect(text).toContain('"end_index":0');
    expect(text).toContain('https://example.com');
  });

  it('normalises nested url_citation format (Google/Gemini via LLM Gateway)', async () => {
    const chunks = [
      {
        choices: [
          {
            index: 0,
            delta: {
              content: 'It is sunny.',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://weather.com',
                    title: 'Weather',
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
    const wrapper = createLLMGatewayFetchWrapper({}, mockFetch);

    const response = await wrapper(
      'https://api.llmgateway.io/v1/chat/completions',
      { method: 'POST', body: JSON.stringify({ model: 'test', messages: [] }) }
    );

    const text = await readStreamToString(response.body!);
    const chunk = JSON.parse(text.replace(/^data: /, '').split('\n')[0]) as {
      choices: Array<{ delta: { annotations: unknown[] } }>;
    };
    const annotation = chunk.choices[0].delta.annotations[0] as Record<
      string,
      unknown
    >;

    expect(annotation.type).toBe('url_citation');
    expect(annotation.url).toBe('https://weather.com');
    expect(annotation.title).toBe('Weather');
    expect(annotation.start_index).toBe(0);
    expect(annotation.end_index).toBe(0);
    expect(annotation).not.toHaveProperty('url_citation');
  });

  it('promotes message.annotations into delta.annotations on final chunk', async () => {
    const chunks = [
      {
        choices: [
          {
            index: 0,
            delta: { content: 'The weather is nice.' },
            message: {
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://weather.com',
                  title: 'Weather',
                },
              ],
            },
          },
        ],
      },
    ];

    const sseBody = buildSSEBody(chunks);
    const mockFetch = createStreamingMockFetch(sseBody);
    const wrapper = createLLMGatewayFetchWrapper({}, mockFetch);

    const response = await wrapper(
      'https://api.llmgateway.io/v1/chat/completions',
      { method: 'POST', body: JSON.stringify({ model: 'test', messages: [] }) }
    );

    const text = await readStreamToString(response.body!);
    expect(text).toContain('"annotations"');
    expect(text).toContain('https://weather.com');
    expect(text).not.toContain('"message"');
  });
});
