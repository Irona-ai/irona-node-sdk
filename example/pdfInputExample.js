const { IronlabsAI } = require('ironlabsai');
const fs = require('fs');

const body = {
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'url',
            url: 'https://assets.anthropic.com/m/1cd9d098ac3e6467/original/Claude-3-Model-Card-October-Addendum.pdf',
          },
          filename: 'document.pdf',
        },
        {
          type: 'text',
          text: 'write short title for it',
        },
      ],
    },
  ],
  models: ['openai/gpt-4o'],
  fallbackModels: ['openai/gpt-4o-mini', 'openai/chatgpt-4o-latest'],
  stream: true,
};

async function modelSelectTest() {
  const sdkClient = await IronlabsAI.createInstance();
  try {
    // Select a model
    const modelResponse = await sdkClient.modelSelect(body);
    console.info('Model selected:' + JSON.stringify(modelResponse));
  } catch (error) {
    console.log('Error in SDK selectModel usage:\n');
    console.error(error);
  }
}

async function CompletionsTest(body) {
  const sdkClient = await IronlabsAI.createInstance({});
  try {
    const { provider, model, response } =
      await sdkClient.completions.create(body);
    console.log(`Current provider: ${provider}, model: ${model}\n`);
    let accumulated = '';
    if (body.stream) {
      for await (const chunk of response) {
        console.log(chunk);
        accumulated += chunk.content;
      }
    } else {
      console.log(response);
      accumulated += response.content;
    }
    console.log(accumulated);
  } catch (error) {
    console.log('Error in SDK Completion usage:\n');
    console.error(error);
  }
}
// modelSelectTest();
CompletionsTest(body);
