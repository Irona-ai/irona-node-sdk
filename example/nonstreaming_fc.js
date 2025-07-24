const { IronaAI, z,tool } = require("ironaai");

const TimeSchema = z.object({
  city: z.string().describe("City to get the current time for"),
});

// Define your tool using the ai/tool helper
const getTimeTool = tool({
  name: "getTime",
  description: "Get the current local time for a city",
  parameters: TimeSchema,
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
    // Step 1: Ask the model to identify tool args
    const fcResult = await sdkClient.completions.create({
      models: ["openai/gpt-4o-mini"],
      fc: true,
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
            { type: "text", text: "Tell me the current time in Tokyo using the getTime tool." },
          ],
        },
      ],
    });

    const toolCall = fcResult.response.tool_calls?.[0];
    if (!toolCall) {
      console.log("No tool calls made by model.");
      return;
    }

    console.log("\n==================== TOOL CALL DETECTED ====================");
    const args = toolCall.args || toolCall.arguments;
    console.log("Arguments:", args);
    console.log("===========================================================\n");

    // Step 2: Run the tool function locally
    console.log("\n==================== TOOL EXECUTION ====================");
    const toolResult = await getTimeTool.execute(args);
    console.log("Tool result:", toolResult);
    console.log("=======================================================\n");

    // Step 3: Ask the model to generate a natural language reply using the tool result
    console.log("\n==================== FINAL OUTPUT GENERATION ====================");
    const finalResponse = await sdkClient.completions.create({
      models: ["openai/gpt-4o-mini"],
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Based on the structured data returned by a tool, explain the current time in a friendly way.",
        },
        {
          role: "user",
          content: `Here is the tool result: ${JSON.stringify(toolResult)}. Please explain this to the user.`,
        },
      ],
    });

    console.log("\n📝 Final Output:");
    console.log(finalResponse.response.content);
    console.log("===============================================================\n");

  } catch (error) {
    console.error("Error:", error);
  }
}

runTimeQuery();
