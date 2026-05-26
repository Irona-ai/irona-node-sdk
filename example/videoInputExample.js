const { IronaAI } = require('../src/index');
const fs = require('fs');

const commonBody = {
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Please describe what is happening in this video.',
        },
        {
          // Google AI Studio (gemini-*) only accepts YouTube URLs for video_url.
          // For arbitrary video files use base64 (runBase64VideoExample).
          type: 'video_url',
          video_url: {
            url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
          },
        },
      ],
    },
  ],
  models: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
  fallbackModels: ['google/gemini-2.5-flash'],
};

function encodeVideoToBase64(videoPath) {
  const videoBuffer = fs.readFileSync(videoPath);
  const base64Video = videoBuffer.toString('base64');
  return `data:video/mp4;base64,${base64Video}`;
}

async function modelSelectTest() {
  const sdkClient = await IronaAI.createInstance();
  try {
    const modelResponse = await sdkClient.modelSelect({
      ...commonBody,
      topkModels: 1,
    });
    console.log(
      '[videoInput] Model selected: ' + JSON.stringify(modelResponse)
    );
  } catch (error) {
    console.error('[videoInput] Error in modelSelect:', error);
  }
}

// CASE 1: Video input via URL (streaming)
async function runVideoUrlExample() {
  const sdkClient = await IronaAI.createInstance();
  try {
    const { provider, model, response } = await sdkClient.completions.create({
      ...commonBody,
      stream: true,
    });
    console.log(`[videoInput] Provider: ${provider}, Model: ${model}`);

    let accumulated = '';
    for await (const chunk of response.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text);
        accumulated += chunk.text;
      }
    }
    console.log('\n[videoInput] Full response:', accumulated);
  } catch (error) {
    console.error('[videoInput] Error with video URL example:', error);
  }
}

// CASE 2: Base64-encoded local video (streaming)
async function runBase64VideoExample() {
  const videoPath = './input_files/sample_video.mp4';
  if (!fs.existsSync(videoPath)) {
    console.log(
      '[videoInput] Skipping base64 example — place a video at ./input_files/sample_video.mp4 to test.'
    );
    return;
  }

  const base64Video = encodeVideoToBase64(videoPath);
  const sdkClient = await IronaAI.createInstance();
  try {
    const { provider, model, response } = await sdkClient.completions.create({
      ...commonBody,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this video?" },
            {
              type: 'video_url',
              video_url: { url: base64Video },
              filename: 'sample_video.mp4',
            },
          ],
        },
      ],
      stream: true,
    });
    console.log(`[videoInput] Provider: ${provider}, Model: ${model}`);

    let accumulated = '';
    for await (const chunk of response.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text);
        accumulated += chunk.text;
      }
    }
    console.log('\n[videoInput] Full response:', accumulated);
  } catch (error) {
    console.error('[videoInput] Error with base64 video example:', error);
  }
}

// CASE 3: Shorthand video part — { type: 'video', video: url }
async function runVideoShorthandExample() {
  const sdkClient = await IronaAI.createInstance();
  try {
    const { provider, model, response } = await sdkClient.completions.create({
      ...commonBody,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please describe what is happening in this video.',
            },
            {
              type: 'video',
              // Google AI Studio only accepts YouTube URLs — no playlist params.
              video: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
            },
          ],
        },
      ],
      stream: true,
    });
    console.log(
      `[videoInput][shorthand] Provider: ${provider}, Model: ${model}`
    );

    let accumulated = '';
    for await (const chunk of response.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text);
        accumulated += chunk.text;
      }
    }
    console.log('\n[videoInput][shorthand] Full response:', accumulated);
  } catch (error) {
    console.error('[videoInput][shorthand] Error:', error);
  }
}

// modelSelectTest();
// runVideoUrlExample();
runVideoShorthandExample();
// runBase64VideoExample();
