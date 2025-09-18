const { IronaAI } = require("ironaai");

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
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
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
    reasoning_effort : "off"
  };
  const sdkClient = await IronaAI.createInstance({
    fallback_models: ["openai/gpt-4o-mini"],
  });
  try {
    const { provider, model, response, error } = await sdkClient.completions.create(body);
    console.log(`[basicExample] Selected provider: ${provider}, model: ${model}, response: ${JSON.stringify(response, null, 2)}\n`);
    let accumulated = "";
    let reasoningData = "";
    let usage = {};

    if (body.stream) {
      for await (const part of response.fullStream) {
        // console.log("part: " + JSON.stringify(part, null, 2));
        if (part.type === "text-delta") {
          accumulated += part.text;
        } if (part.type === "reasoning-delta") {
          reasoningData += part.text;
        }
        if (part.type === "finish") {
          usage = part.totalUsage;
        }
      }
    } else {
      console.log("[basicExample]", response);
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
    console.log("[basicExample AccumulatedData] " + accumulated);
    console.log("[basicExample ReasoningData] " + reasoningData);
    console.log("[basicExample] " + JSON.stringify(usage));
    console.log("[basicExample] error: " + error);
  } catch (error) {
    console.log("[basicExample] Error in SDK Completion usage:\n");
    console.error("[basicExample]", error);
  }
}
modelSelectTest();
CompletionsTest();
