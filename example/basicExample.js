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
  models: ["mistral/mistral-medium-latest"],
  fallback_models: ["openai/gpt-4o-mini", "google/gemini-1.5-flash-latest"],
  stream: true,
  temprature: 0.8,
};

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
CompletionsTest();
