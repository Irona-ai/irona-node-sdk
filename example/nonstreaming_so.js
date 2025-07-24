import { IronaAI } from "ironaai";
import { z } from "zod";

const weatherSchema = z.object({
  temperature: z.number(),
  condition: z.string(),
  humidity: z.number().optional(),
  city: z.string(), 
});

async function runExamples() {
  const sdkClient = await IronaAI.createInstance();
  const body = {
    models: ["openai/gpt-4o"],
    fallback_models: ["openai/gpt-4o-mini"],
    so: true,
    temperature: 0.7,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please provide today's weather for Bangalore: temperature, condition, humidity, and city name as JSON only.",
          },
        ],
      },
    ],
    structuredOutput: {
      prompt: "Extract the temperature, condition, humidity and bangalore name in structured JSON.",
      schema: weatherSchema,
    },
  };

  try {
    const soResult = await sdkClient.completions.create(body);
    console.log("SO Result:", soResult.response.content);
  } catch (err) {
    console.error("Error during SO call:", err);
  }
}

runExamples();
