const { IronaAI } = require('ironaai');

const commonBody = {
  messages: [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Latest news July 04 2025 India' }],
    },
  ],
  models: [
    'perplexity/sonar-reasoning-pro',
    'mistral/open-mixtral-8x22b',
    'google/gemini-1.0-pro-latest',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash',
    'togetherai/DeepSeek-R1',
    'mistral/magistral-small-latest',
    'openai/o4-mini',
    'anthropic/claude-3-7-sonnet-20250219',
    'anthropic/claude-3-7-sonnet-latest',
    'anthropic/claude-opus-4-20250514',
    'anthropic/claude-opus-4-0',
    'anthropic/claude-sonnet-4-20250514',
    'anthropic/claude-sonnet-4-0',
    'openai/o1-mini',
  ],
  fallbackModels: ['openai/gpt-4o-mini', 'google/gemini-1.5-flash-latest'],
};

async function modelSelectTest() {
  let body = {
    ...commonBody,
    topkModels: 2,
  };
  const sdkClient = await IronaAI.createInstance();
  try {
    // Select a model
    const modelResponse = await sdkClient.modelSelect({
      ...body,
      topkModels: 2,
    });
    console.info(
      '[basicExample] Model selected:' + JSON.stringify(modelResponse)
    );
  } catch (error) {
    console.log('[basicExample] Error in SDK selectModel usage:\n');
    // console.error(Object.keys(error), error.message, error.name, error.code, error.request, error.response, error.status);
    console.error('[basicExample]', error);
  }
}
async function CompletionsTest() {
  let body = {
    ...commonBody,
    stream: true,
    temperature: 0.2,
    reasoningEffort: 'medium',
  };
  const sdkClient = await IronaAI.createInstance({
    fallbackModels: ['openai/gpt-4o-mini'],
  });
  try {
    const { provider, model, response, error } =
      await sdkClient.completions.create(body);
    console.log(
      `[basicExample] Selected provider: ${provider}, model: ${model}, response: ${JSON.stringify(response, null, 2)}\n`
    );
    let accumulated = '';
    let reasoningData = '';
    let usage = {};

    if (body.stream) {
      for await (const part of response.fullStream) {
        // console.log("part: " + JSON.stringify(part.type, null, 2));
        if (part.type === 'text-delta') {
          accumulated += part.text;
        }
        if (part.type === 'reasoning-delta') {
          reasoningData += part.text;
        }
        if (part.type === 'finish') {
          usage = part.totalUsage;
        }
      }
    } else {
      console.log('[basicExample]', response);
      accumulated += response.content;
      // Extract reasoning content if available
      if (response.reasoningContent) {
        for (const content of response.reasoningContent) {
          if (content.type === 'reasoning') {
            reasoningData += content.text;
          }
        }
      }
    }
    console.log('[basicExample AccumulatedData] ' + accumulated);
    console.log('[basicExample ReasoningData] ' + reasoningData);
    console.log('[basicExample] ' + JSON.stringify(usage));
    console.log('[basicExample] error: ' + error);
  } catch (error) {
    console.log('[basicExample] Error in SDK Completion usage:\n');
    console.error('[basicExample]', error);
  }
}
modelSelectTest();
CompletionsTest();
