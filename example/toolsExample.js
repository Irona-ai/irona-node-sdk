const { IronaAI } = require("ironaai");
const { z } = require("zod");
const { tool } = require("ai");

// Example 1: Using tools with completions.create()
async function completionsWithTools() {
  console.log("\n=== Example 1: Completions with Tools ===\n");

  const sdkClient = await IronaAI.createInstance();

  // Define tools using Vercel AI SDK format
  const tools = {
    getWeather: tool({
      description: "Get the weather for a specific location",
      parameters: z.object({
        location: z.string().describe("The city and state, e.g. San Francisco, CA"),
        unit: z.enum(["celsius", "fahrenheit"]).optional().describe("Temperature unit"),
      }),
      execute: async ({ location, unit = "fahrenheit" }) => {
        // This is a mock implementation
        // In a real application, you would call a weather API here
        return {
          location,
          temperature: unit === "celsius" ? 22 : 72,
          unit,
          conditions: "Partly cloudy",
        };
      },
    }),

    getCurrentTime: tool({
      description: "Get the current time in a specific timezone",
      parameters: z.object({
        timezone: z.string().describe("IANA timezone, e.g. America/New_York"),
      }),
      execute: async ({ timezone }) => {
        // Mock implementation
        const now = new Date();
        return {
          timezone,
          time: now.toLocaleString("en-US", { timeZone: timezone }),
          timestamp: now.toISOString(),
        };
      },
    }),
  };

  const body = {
    messages: [
      {
        role: "user",
        content: "What's the weather like in San Francisco? Also, what time is it there?",
      },
    ],
    models: ["openai/gpt-4o-mini"],
    tools: tools,
    stream: false,
    temperature: 0.7,
  };

  try {
    const { provider, model, response } = await sdkClient.completions.create(body);
    console.log(`Provider: ${provider}, Model: ${model}`);
    console.log("Response:", response.content);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Example 2: Using tools with streaming
async function streamingWithTools() {
  console.log("\n=== Example 2: Streaming with Tools ===\n");

  const sdkClient = await IronaAI.createInstance();

  const tools = {
    calculate: tool({
      description: "Perform mathematical calculations",
      parameters: z.object({
        expression: z.string().describe("Mathematical expression to evaluate"),
      }),
      execute: async ({ expression }) => {
        // Mock implementation - in production, use a safe math parser
        try {
          // Simple evaluation for demo purposes
          const result = eval(expression);
          return { expression, result };
        } catch (error) {
          return { expression, error: "Invalid expression" };
        }
      },
    }),
  };

  const body = {
    messages: [
      {
        role: "user",
        content: "What is 15 * 24 + 37?",
      },
    ],
    models: ["openai/gpt-4o-mini"],
    tools: tools,
    stream: true,
  };

  try {
    const { provider, model, response } = await sdkClient.completions.create(body);
    console.log(`Provider: ${provider}, Model: ${model}`);

    let accumulated = "";
    for await (const chunk of response.fullStream) {
      if (chunk.type === "text-delta") {
        accumulated += chunk.text;
        process.stdout.write(chunk.text);
      }
      if (chunk.type === "finish") {
        console.log("\n\nUsage:", chunk.totalUsage);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Example 3: Using tools with model selection (multi-model routing)
async function modelSelectWithTools() {
  console.log("\n=== Example 3: Model Selection with Tools ===\n");

  const sdkClient = await IronaAI.createInstance();

  const tools = {
    searchDatabase: tool({
      description: "Search a database for information",
      parameters: z.object({
        query: z.string().describe("Search query"),
        limit: z.number().optional().describe("Maximum number of results"),
      }),
      execute: async ({ query, limit = 10 }) => {
        // Mock implementation
        return {
          query,
          results: [
            { id: 1, title: "Result 1", relevance: 0.95 },
            { id: 2, title: "Result 2", relevance: 0.87 },
          ],
          count: 2,
          limit,
        };
      },
    }),
  };

  const body = {
    messages: [
      {
        role: "user",
        content: "Search for information about machine learning",
      },
    ],
    models: [
      "openai/gpt-4o-mini",
      "anthropic/claude-3-haiku-20240307",
      "google/gemini-1.5-flash-latest",
    ],
    tools: tools,
    fallback_models: ["openai/gpt-3.5-turbo"],
  };

  try {
    const { provider, model, response } = await sdkClient.completions.create(body);
    console.log(`Provider: ${provider}, Model: ${model}`);
    console.log("Response:", response.content);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Example 4: Tools with search functionality combined
async function toolsWithSearch() {
  console.log("\n=== Example 4: Tools Combined with Web Search ===\n");

  const sdkClient = await IronaAI.createInstance();

  const tools = {
    saveToDatabase: tool({
      description: "Save information to database",
      parameters: z.object({
        data: z.string().describe("Data to save"),
        category: z.string().describe("Category for the data"),
      }),
      execute: async ({ data, category }) => {
        // Mock implementation
        return {
          saved: true,
          id: Math.random().toString(36).substr(2, 9),
          category,
        };
      },
    }),
  };

  const body = {
    messages: [
      {
        role: "user",
        content: "Search for the latest AI developments and save them to the 'technology' category",
      },
    ],
    models: ["openai/gpt-4o-mini"],
    tools: tools,
    search: true, // Enable web search
    stream: false,
  };

  try {
    const { provider, model, response } = await sdkClient.completions.create(body);
    console.log(`Provider: ${provider}, Model: ${model}`);
    console.log("Response:", response.content);
    console.log("\nNote: This example combines both web search and custom tools!");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Example 5: Model select (accepts tools but doesn't use them for routing)
async function modelSelectExample() {
  console.log("\n=== Example 5: Model Select with Tools ===\n");

  const sdkClient = await IronaAI.createInstance();

  const tools = {
    testTool: tool({
      description: "A test tool",
      parameters: z.object({
        input: z.string(),
      }),
    }),
  };

  const body = {
    messages: [
      {
        role: "user",
        content: "Hello, which model should I use?",
      },
    ],
    models: [
      "openai/gpt-4o-mini",
      "anthropic/claude-3-haiku-20240307",
    ],
    tools: tools, // Tools are accepted but don't affect model selection
    topk_models: 2,
  };

  try {
    const modelResponse = await sdkClient.modelSelect(body);
    console.log("Selected models:", JSON.stringify(modelResponse, null, 2));
    console.log("\nNote: Tools are accepted in model-select but don't affect the routing decision");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run all examples
async function main() {
  console.log("=".repeat(60));
  console.log("IronaAI Tools Support Examples");
  console.log("=".repeat(60));

  try {
    await completionsWithTools();
    await streamingWithTools();
    await modelSelectWithTools();
    await toolsWithSearch();
    await modelSelectExample();
  } catch (error) {
    console.error("Error running examples:", error);
  }

  console.log("\n" + "=".repeat(60));
  console.log("All examples completed!");
  console.log("=".repeat(60));
}

main();
