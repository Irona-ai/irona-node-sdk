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
    'google/gemini-2.0-flash',
    'openai/gpt-4o-mini',
  ],
  fallback_models: ['openai/gpt-4o-mini'],
  stream: false,
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
    fallback_models: ['openai/gpt-4o-mini'],
  });
  try {
    const { provider, model, response, error } =
      await sdkClient.completions.create(body);
    let accumulated = '';
    let usage = {};
    if (body.stream) {
      for await (const textStreamPart of response.fullStream) {
        console.log(
          'textStreamPart: ' + JSON.stringify(textStreamPart, null, 2)
        );
        if (textStreamPart.type === 'text-delta') {
          // accumulated += textStreamPart.textDelta;  // this is outdated
          accumulated += textStreamPart.text; //this is use in updated version
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
    console.log('Usage:', usage);
    console.log('Error:', error);
  } catch (error) {
    console.log('Error in SDK Completion usage or during fallback:\n');
    console.error(error);
  }
}

modelSelectTest();
CompletionsTest();
