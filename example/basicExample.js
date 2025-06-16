const { IronaAI } = require("ironaai");

const body = {
  messages: [{ role: "user", content: "short greeting message" }],
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
    const { provider, model, response } = await sdkClient.completions.create(
      body
    );
    console.log(`Selected provider: ${provider}, model: ${model}\n`);
    let accumulated = "";
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
    console.log("Error in SDK Completion usage:\n");
    console.error(error);
  }
}
modelSelectTest();
CompletionsTest();
