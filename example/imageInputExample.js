const { IronaAI } = require('ironaai');
const fs = require('fs');

const body = {
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: "What's in this image?" },
        {
          type: 'image_url',
          image_url: {
            url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg',
          },
        },
      ],
    },
  ],
  models: ['anthropic/claude-3-5-sonnet-20240620'],
  fallback_models: ['openai/gpt-4o-mini', 'google/gemini-1.5-flash-latest'],
  stream: true,
};

function encodeImageToBase64WithMime(filePath) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString('base64');

  // Determine the MIME type if known (you can adjust this based on file extension)
  const mimeType = 'image/webp'; // Change this according to your image type (e.g., 'image/png', 'image/gif')

  // Construct the data URL
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  return dataUrl;
}

async function modelSelectTest() {
  const sdkClient = await IronaAI.createInstance();
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
  const sdkClient = await IronaAI.createInstance({
    fallback_models: ['openai/gpt-4o-mini'],
  });
  try {
    const { provider, model, response } =
      await sdkClient.completions.create(body);
    console.log(`Selected provider: ${provider}, model: ${model}\n`);
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

// CASE 1: completions with image url input.
CompletionsTest(body);

// CASE 2: completions with images input with base64 encoding.
const filePath = './input_files/input_image.webp';
const dataUrl = encodeImageToBase64WithMime(filePath);
const body2 = {
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: "What's in this image?" },
        {
          type: 'image_url',
          image_url: {
            url: dataUrl,
          },
        },
      ],
    },
  ],
  models: ['anthropic/claude-3-5-sonnet-20240620'],
  fallback_models: ['openai/gpt-4o-mini', 'google/gemini-1.5-flash-latest'],
  stream: true,
};

CompletionsTest(body2);
