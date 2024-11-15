// require("dotenv").config({ path: "./.env" });
const { IronaAI } = require("ironaai");

const body = {
  topk_models: 3,
  messages: [
    { role: "user", content: "Write a poem?" },
  ],
  models: [
    "openai/gpt-4-1106-preview",
    "openai/gpt-4-turbo",
    "anthropic/claude-3-opus-20240229",
    "anthropic/claude-2.1",
    "mistral/open-mixtral-8x22b",
    "google/gemini-1.0-pro-latest",
  ],
};

const testCompletions = async (sdkClient, body) => {
  try {
    const data = {
      messages: body.messages,
      models: body.models,
      temperature: 0.7,
      maxTokens: 10,
    //   maxRetries: 3,
    //   stream: true,
    };
    const chatResponse = await sdkClient.completions.create(data);
    console.log(chatResponse.provider);
    console.log(chatResponse.model);
    try {
      for await (const chunk of chatResponse.response) {
        console.info(chunk);
      }
    } catch (error) {}
    console.log(chatResponse.response);
  } catch (error) {
    console.log("Error in SDK Completion usage:\n");
    console.error(error);
  }
};

const testSelectModel = async (sdkClient, body) => {
  try {
    // Select a model
    const modelResponse = await sdkClient.modelSelect(body);
    console.info("Model selected:" + JSON.stringify(modelResponse));
  } catch (error) {
    console.log("Error in SDK selectModel usage:\n");
    console.error(error);
  }
};

async function main() {
  const sdkClient = new IronaAI();
    await testSelectModel(sdkClient, body);
//   await testCompletions(sdkClient, body);
}
main();
