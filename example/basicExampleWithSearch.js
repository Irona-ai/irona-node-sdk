const { IronaAI } = require('ironaai');

const body = {
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: "What is the today's weather like in Bengaluru Temperature ?",
        },
      ],
    },
  ],
  models: [
    // You can use any supported model here
    // 'google/gemini-2.5-flash',
    // 'openai/gpt-4o-mini',
    // "openai/gpt-5",
    // 'google/gemini-2.5-pro',
    // "xai/grok-3-mini"
    'xai/grok-4-fast',
  ],
  fallbackModels: ['openai/gpt-4o-mini'],
  stream: true,
  search: true, // <-- This enables useSearchGrounding in the SDK logic
};

async function modelSelectTest() {
  const sdkClient = await IronaAI.createInstance();
  try {
    // Select a model
    const modelResponse = await sdkClient.modelSelect(body);
    console.info(
      'Model selected with search enabled:' + JSON.stringify(modelResponse)
    );
  } catch (error) {
    console.log('Error in SDK selectModel usage:\n');
    console.error(error);
  }
}

async function CompletionsTest() {
  const sdkClient = await IronaAI.createInstance({
    fallbackModels: ['openai/gpt-4o-mini'],
  });
  try {
    const { provider, model, response, error } =
      await sdkClient.completions.create(body);
    let accumulated = '';
    let usage = {};
    const sources = [];
    if (body.stream) {
      for await (const textStreamPart of response.fullStream) {
        if (textStreamPart.type === 'text-delta') {
          // accumulated += textStreamPart.textDelta;  // this is outdated
          accumulated += textStreamPart.text; //this is use in updated version
        }
        if (textStreamPart.type === 'source') {
          // The AI SDK emits source fields flat on the part itself (no nested .source):
          // { type: 'source', sourceType: 'url', id, url, title }
          sources.push({
            type: 'source',
            sourceType: textStreamPart.sourceType,
            id: textStreamPart.id,
            url: textStreamPart.url,
            title: textStreamPart.title,
          });
        }
        if (textStreamPart.type === 'finish') {
          // usage = textStreamPart.usage; // this is outdated
          usage = textStreamPart.totalUsage; // this is used in updated version
        }
      }
    } else {
      console.log(response);
      accumulated += response.content;
    }
    console.log('Accumulated:', accumulated);
    console.log('Sources:', JSON.stringify(sources, null, 2));
    console.log('Usage:', usage);
    console.log('Error:', error);
  } catch (error) {
    console.log('Error in SDK Completion usage or during fallback:\n');
    console.error(error);
  }
}

modelSelectTest();
CompletionsTest();
