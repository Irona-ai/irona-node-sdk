const { IronaAI } = require("ironaai");
const fs = require("fs");

const body = {
  messages: [
    {
      role: "user",
      content: [
        {
            "type": "file",
            "data": "https://assets.anthropic.com/m/1cd9d098ac3e6467/original/Claude-3-Model-Card-October-Addendum.pdf",
            "mimeType": "application/pdf",
            "filename": "document.pdf",
        },
        {
            "type": "text",
            "text": "What are the key findings in this document?"
        }
    ],
    },
  ],
  models: ["openai/gpt-4o"],
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

async function CompletionsTest(body) {
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
// modelSelectTest();
CompletionsTest(body);
