import { IronaAI, z, tool } from "ironaai";

// 1. 🧩 Define Schema for getTime (structured output)
const TimeSchema = z.object({
  city: z.string().describe("City to get the current time for"),
  time: z.string().describe("Current time in UTC string format"),
  timezone: z.string().describe("Timezone of the city"),
});

// 2. 🔧 Define Tool using the 'tool' helper
const getTimeTool = tool({
  name: "getTime",
  description: "Get the current local time for a city",
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const now = new Date();
    return {
      city,
      time: now.toUTCString(),
      timezone: "UTC (demo - streaming)",
    };
  },
});

async function runStreamingTimeQuery() {
  const sdkClient = await IronaAI.createInstance();
  try {
    // Step 1: Ask the model to identify tool args (function calling)
    const fcResult = await sdkClient.completions.create({
      models: ["openai/gpt-4o-mini"],
      fc: true,
      so: true,
      stream: true,
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

    console.log("fcResult.response.fullStream:", fcResult.response.fullStream);
    console.log("Type of fullStream:", typeof fcResult.response.fullStream);
    console.log("Is async iterable:", fcResult.response.fullStream && typeof fcResult.response.fullStream[Symbol.asyncIterator] === 'function');

    // Only this loop! Do not read the stream elsewhere.
    for await (const part of fcResult.response.fullStream) {
      console.log("Stream part:", part);
      // ... handle tool call, accumulate output, etc.
    }

    let accumulated = "";
    let toolCall = null;
    let toolResult = null;
    let finalStructured = "";
    let step = 1;

    for await (const part of fcResult.response.fullStream) {
      if (part.type === "tool-call") {
        console.log("\n==================== TOOL CALL DETECTED ====================");
        toolCall = part.toolCall || part;
        const args = toolCall.args || toolCall.arguments;
        console.log("Arguments:", args);
        console.log("===========================================================\n");
        // Step 2: Run the tool function locally
        toolResult = await getTimeTool.execute(args);
        console.log("\n==================== TOOL EXECUTION ====================");
        console.log("Tool result:", toolResult);
        console.log("=======================================================\n");
        // Step 3: Ask the model to generate a structured output using the tool result
        const finalStream = await sdkClient.completions.create({
          models: ["openai/gpt-4o-mini"],
          so: true,
          stream: true,
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
        for await (const chunk of finalStream.response.fullStream) {
          if (chunk.type === "text-delta" && typeof chunk.textDelta === "string") {
            finalStructured += chunk.textDelta;
            process.stdout.write(chunk.textDelta);
          }
        }
        console.log("\n==================== FINAL STRUCTURED OUTPUT ====================");
        try {
          const parsed = JSON.parse(finalStructured.replace(/```/g, "").trim());
          console.log(parsed);
        } catch {
          console.log(finalStructured);
        }
        break; // End after handling the tool call and final output
      } else if (part.type === "text-delta" && typeof part.textDelta === "string") {
        accumulated += part.textDelta;
        process.stdout.write(part.textDelta);
      }
    }
  } catch (error) {
    console.error("Error in streaming FC+SO example:", error);
  }
}

runStreamingTimeQuery();
