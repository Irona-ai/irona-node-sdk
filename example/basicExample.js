const { IronaAI } = require("../src/index");

const commonBody = {
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Latest news July 04 2025 India" },
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
    "google/gemini-2.0-flash",
  ],
  fallback_models: ["openai/gpt-4o-mini", "google/gemini-1.5-flash-latest"],
};

async function modelSelectTest() {
  let body = {
    ...commonBody,
    topk_models: 2
  }
  const sdkClient = await IronaAI.createInstance();
  try {
    // Select a model
    const modelResponse = await sdkClient.modelSelect({...body, topk_models: 2});
    console.info("[basicExample] Model selected:" + JSON.stringify(modelResponse));
  } catch (error) {
    console.log("[basicExample] Error in SDK selectModel usage:\n");
    // console.error(Object.keys(error), error.message, error.name, error.code, error.request, error.response, error.status);
    console.error("[basicExample]", error);
  }
}
async function CompletionsTest() {
  let body = {
    ...commonBody,
    stream: true,
    temperature: 0.2,
  };
  const sdkClient = await IronaAI.createInstance({
    fallback_models: ["openai/gpt-4o-mini"],
  });
  try {
    const { provider, model, response, error } = await sdkClient.completions.create(body);
    console.log(`[basicExample] Selected provider: ${provider}, model: ${model}, response: ${JSON.stringify(response, null, 2)}\n`);
    let accumulated = "";
    let usage = {};

    if (body.stream) {
      for await (const textStreamPart of response.fullStream) {
        // console.log("textStreamPart: " + JSON.stringify(textStreamPart, null, 2));
        if (textStreamPart.type === "text-delta") {
          // accumulated += textStreamPart.textDelta; // this is outdated
          accumulated += textStreamPart.text;
        }
        if (textStreamPart.type === "finish") {

          // usage = textStreamPart.usage;  // this is outdated
          usage = textStreamPart.totalUsage;
        }
      }
    } else {
      console.log("[basicExample]", response);
      accumulated += response.content;
    }
    console.log("[basicExample] " + accumulated);
    console.log("[basicExample] " + JSON.stringify(usage));
    console.log("[basicExample] error: " + error);
  } catch (error) {
    console.log("[basicExample] Error in SDK Completion usage:\n");
    console.error("[basicExample]", error);
  }
}
modelSelectTest();
CompletionsTest();
