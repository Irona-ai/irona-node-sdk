const { IronaAI } = require("ironaai");

const body = {
  messages: [{ role: "user", content: "bye in max 10 words" }],
  models: [
    // "openai/gpt-4-1106-preview",
    // "openai/gpt-4-turbo",
    "perplexity/llama-3.1-sonar-large-128k-online",
    // "anthropic/claude-3-opus-20240229",
    // "anthropic/claude-2.1",
    // "mistral/open-mixtral-8x22b",
    // "google/gemini-1.0-pro-latest",
  ],
  fallback_models: ["mistral/open-mixtral-8x22b", "openai/gpt-4-turbo"],
  stream: true
};

async function modelSelectTest() {
  const sdkClient = new IronaAI();
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
  const sdkClient = new IronaAI();
  try {
    const { provider, model, response } = await sdkClient.completions.create(
      body
    );
    console.log(`Selected provider: ${provider}, model: ${model}\n`);

    if (body.stream) {
      for await (const chunk of response) {
        console.log(chunk);
      }
    }else{
      console.log(response);
    }
  } catch (error) {
    console.log("Error in SDK Completion usage:\n");
    console.error(error);
  }
}
// modelSelectTest();
CompletionsTest();
