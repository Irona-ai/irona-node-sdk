// require("dotenv").config({ path: "./.env" });
const { IronaAI } = require("ironaai");

const body = {
  messages: [
    { role: "system", content: "You are a world class software developer." },
    { role: "assistant", content: "How can I assist you today?" },
    { role: "user", content: "Write a merge sort in python" },
  ],
  models: [
    "openai/gpt-4-1106-preview",
    "openai/gpt-4-turbo",
    "anthropic/claude-3-opus-20240229",
  ],
};

const testCompletions = async (sdkClient, body) => {
  // TODO: as of now model-select does not support all the models provided below, so we are using them here separately. Once model-select supports all the models, we can use them using body.models[index],
  const openAI = "openai/gpt-4-1106-preview";
  const togetherAI = "togetherai/Phind-CodeLlama-34B-v2";
  const anthropicAI = "anthropic/claude-2.1";
  const mistralAI = "mistral/open-mixtral-8x22b";
  const googleGenAI = "google/gemini-1.0-pro-latest";
  try {
    const data = {
      model: openAI, // TODO: body.models[0],
      messages: body.messages,
      temperature: 0.7,
      maxTokens: 100,
      // stream: true,
    };
    const chatResponse = await sdkClient.completions.create(data);
    try {
      for await (const chunk of chatResponse) {
        console.info(JSON.stringify(chunk, null, 2));
      }
    } catch (error) {}
    console.info("Chat Response:\n" + JSON.stringify(chatResponse, null, 2));
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
  await testCompletions(sdkClient, body);
}
main();
