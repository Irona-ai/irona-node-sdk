// require("dotenv").config({ path: "./.env" });
const { IronaAI } = require("ironaai");

const body = {
  messages: [
    { role: "system", content: "You are a world class software developer." },
    { role: "assistant", content: "How can I assist you today?" },
    { role: "user", content: "Write a merge sort in python" },
  ],
  llm_providers: [
    {
      provider: "openai",
      model: "gpt-4-1106-preview",
    },
    {
      provider: "openai",
      model: "gpt-4-turbo",
    },
    {
      provider: "anthropic",
      model: "claude-3-opus-20240229",
    },
  ],
};

const testCompletions = async (sdkClient, body) => {
  const openAI = "openai/gpt-4-1106-preview";
  const togetherAI = "togetherai/Phind-CodeLlama-34B-v2";
  const anthropicAI = "anthropic/claude-2.1";
  const mistralAI = "mistral/open-mixtral-8x22b";
  const googleGenAI = "google/gemini-1.0-pro-latest";
  try {
    const data = {
      model: openAI,
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
    console.error("Error in SDK Completion usage:\n" + error);
  }
};

const testSelectModel = async (sdkClient, body) => {
  try {
    // Select a model
    const modelResponse = await sdkClient.modelSelect(body);
    console.info("Model selected:" + JSON.stringify(modelResponse));
  } catch (error) {
    console.error("Error in SDK selectModel usage:\n" + error);
  }
};

async function main() {
  const apiKey = process.env.IRONAAI_API_KEY;

  if (!apiKey) {
    throw new Error("IRONAAI_API_KEY is not set in the environment variables.");
  }
  const sdkClient = new IronaAI();

  await testSelectModel(sdkClient, body);
  await testCompletions(sdkClient, body);
}
main();
