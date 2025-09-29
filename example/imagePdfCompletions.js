const { IronaAI } = require("ironaai");

const commonBody = {
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
        {
          type: "document",
          source: {
            type: "url",
            url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          },
        },
        { type: "text", text: "describe files" },
      ],
    }
  ],
  models: [
    "openai/gpt-4-1106-preview",
    "openai/gpt-4o",
    "openai/gpt-4-turbo",
    "perplexity/sonar",
    "anthropic/claude-3-opus-20240229",
    "anthropic/claude-2.1",
    "mistral/open-mixtral-8x22b",
    "google/gemini-1.0-pro-latest",
  ],
  fallback_models: ["openai/gpt-4o-mini", "google/gemini-1.5-flash-latest"],
};

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
    const { provider, model, response, error } =
      await sdkClient.completions.create(body);
    console.log(
      `[basicExample] Selected provider: ${provider}, model: ${model}, response: ${JSON.stringify(
        response,
        null,
        2
      )}\n`
    );
    let accumulated = "";
    let usage = {};

    if (body.stream) {
      for await (const textStreamPart of response.fullStream) {
        // console.log("textStreamPart: " + JSON.stringify(textStreamPart, null, 2));
        if (textStreamPart.type === "text-delta") {
          // accumulated += textStreamPart.textDelta;  // this is outdated
          accumulated += textStreamPart.text; //this is use in updated version
        }
        if (textStreamPart.type === "finish") {
          // usage = textStreamPart.usage;  // this is outdated
          usage = textStreamPart.totalUsage; // this is used in updated version
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
CompletionsTest();
