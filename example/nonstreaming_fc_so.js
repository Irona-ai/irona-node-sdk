const { IronaAI, z,tool } = require("ironaai");

// 1. 🧩 Define Schema for getTime (structured output)
const TimeSchema = z.object({
  city: z.string().describe("City to get the current time for"),
  time: z.string().describe("Current time in UTC string format"),
  timezone: z.string().describe("Timezone of the city"),
});

// 2. 🔧 Define Tool using the 'tool' helper from 'ai'
const getTimeTool = tool({
  name: "getTime",
  description: "Get the current local time for a city",
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const now = new Date();
    return {
      city,
      time: now.toUTCString(),
      timezone: "UTC (demo)",
    };
  },
});

async function runTimeQuery() {
  const sdkClient = await IronaAI.createInstance();
  try {
    // Step 1: Ask the model to identify tool args (function calling)
    const fcResult = await sdkClient.completions.create({
      models: ["openai/gpt-4o-mini"],
      fc: true,
      so: true,
      tools: [getTimeTool],
      toolChoice: "auto",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that uses functions to get data.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Tell me the current time in Tokyo using the getTime tool. Return the answer as a structured object with city, time, and timezone." },
          ],
        },
      ],
      structuredOutput: {
        prompt: "Return a structured object with city, time, and timezone.",
        schema: TimeSchema,
      },
    });

    const toolCall = fcResult.response.tool_calls?.[0];
    if (!toolCall) {
      console.log("No tool calls made by model.");
      return;
    }

    console.log("\n🔧 Tool Call Detected:");
    const args = toolCall.args || toolCall.arguments;
    console.log("Arguments:", args);

    // Step 2: Run the tool function locally
    const toolResult = await getTimeTool.execute(args);
    console.log("\n🛠️ Tool Result:", toolResult);

    // Step 3: Ask the model to generate a structured output using the tool result
    const finalResponse = await sdkClient.completions.create({
      models: ["openai/gpt-4o-mini"],
      so: true,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Based on the structured data returned by a tool, explain the current time in a friendly way and return a structured object with city, time, and timezone.",
        },
        {
          role: "user",
          content: `Here is the tool result: ${JSON.stringify(toolResult)}. Please return a structured object with city, time, and timezone.`,
        },
      ],
      structuredOutput: {
        prompt: "Return a structured object with city, time, and timezone.",
        schema: TimeSchema,
      },
    });

    console.log("\n📝 Final Structured Output:");
    console.log(finalResponse.response.content);
  } catch (error) {
    console.error("Error:", error);
  }
}

runTimeQuery();
