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
 
    "perplexity/sonar-reasoning-pro",
    "anthropic/claude-sonnet-4-20250514",
    "anthropic/claude-2.1",
    "mistral/open-mixtral-8x22b",
    "google/gemini-1.0-pro-latest",
        "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
      "togetherai/DeepSeek-R1",
      "mistral/magistral-small-latest",
      "openai/o4-mini"
  ],
  fallback_models: ["openai/gpt-4o-mini", "google/gemini-1.5-flash-latest"],
};

function filterOutThinkingContent(text) {
  if (!text) return text;
  
  // Remove various thinking tag patterns
  const thinkingPatterns = [
    /<think>[\s\S]*?<\/think>/g,  
    /<reasoning>[\s\S]*?<\/reasoning>/g, 
    /<thought>[\s\S]*?<\/thought>/g,    
    /\[thinking\][\s\S]*?\[\/thinking\]/g, 
    /Thinking:\s*[\s\S]*?(?=\n\n|$)/g, 
  ];
  
  let cleanedText = text;
  thinkingPatterns.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, '');
  });
  
  // Remove any empty lines or excessive whitespace
  cleanedText = cleanedText
    .split('\n')
    .filter(line => line.trim().length > 0)
    .join('\n')
    .trim();
  
  return cleanedText;
}

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
    reasoning_effort : "medium", 
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
         if (body.reasoning_effort === "off" || body.reasoning_effort === undefined) {
        accumulated = filterOutThinkingContent(accumulated);
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
    if (body.reasoning_effort === "off") {
        accumulated = filterOutThinkingContent(accumulated);
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
