const { IronaAI } = require("ironaai");

const body = {
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: "https://p04hwoo4fs.ufs.sh/f/3KAzoBLiFf9AT0RYSRrtvrf27PFzlgNymsQSUB4kiuqKwbZd",
          },
        },
        { type: "text", text: "describe image" },
      ],
    },
  ],
  models: [
    "openai/gpt-4-1106-preview",
    "openai/gpt-4-turbo",
    "perplexity/sonar",
    "anthropic/claude-3-opus-20240229",
    "anthropic/claude-2.1",
    "mistral/open-mixtral-8x22b",
    "google/gemini-1.0-pro-latest",
  ],
  fallback_models: ["openai/gpt-4o-mini", "google/gemini-1.5-flash-latest"],
  stream: true,
  temprature: 0.8,
};

async function modelSelectTest() {
  const sdkClient = await IronaAI.createInstance();
  try {
    // Select a model
    const modelResponse = await sdkClient.modelSelect(body);
    console.info("Model selected:" + JSON.stringify(modelResponse));
  } catch (error) {
    console.log("Error in SDK selectModel usage:\n");
    console.error(error);
  }
}
async function CompletionsTest() {
  const sdkClient = await IronaAI.createInstance({
    fallback_models: ["openai/gpt-4o-mini"],
  });
  try {
    const { provider, model, response, error } =
      await sdkClient.completions.create(body);
    // console.log(`Selected provider: ${provider}, model: ${model}, response: ${JSON.stringify(response, null, 2)}\n`);
    let accumulated = "";
    let usage = {};
    if (body.stream) {
      for await (const textPart of response.textStream) {
        console.log("textPart: " + JSON.stringify(textPart, null, 2));
        if (textPart.type === "text-delta") {
          accumulated += textPart.textDelta;
        }
        if (textPart.type === "finish") {
          usage = textPart.usage;
        }
      }
    } else {
      console.log(response);
      accumulated += response.content;
    }
    console.log(accumulated);
    console.log(usage);
    console.log(error);
  } catch (error) {
    console.log("Error in SDK Completion usage:\n");
    console.error(error);
  }
}
modelSelectTest();
// CompletionsTest();
