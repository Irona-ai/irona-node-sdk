// exampleStreamSO.js
import { IronaAI,z } from "ironaai";


const weatherSchema = z.object({
  temperature: z.number(),
  condition: z.string(),
  humidity: z.number().optional(),
  city: z.string(),
});

async function runStreamingStructuredOutput() {
  const sdkClient = await IronaAI.createInstance();

  const payload = {
    models: ["openai/gpt-4o-mini"],
    so: true,         // Enable structured output
    stream: true,     // Enable streaming
    temperature: 0,   // Low temperature for deterministic output
    messages: [
      {
        role: "user",
        content: [{
          type: "text",
          text: "Provide ONLY the weather for Bangalore as a raw JSON object with keys: temperature (number), condition (string), humidity (number), and city (string). Do NOT include explanations or markdown.",
        }],
      },
    ],
    structuredOutput: {
      prompt: "Output strictly a JSON object with temperature, condition, humidity, and city only, no markdown or text.",
      schema: weatherSchema,
    },
  };

  try {
    const soResult = await sdkClient.completions.create(payload);

    let accumulatedText = "";

    // Consume the async iterable stream of partial text deltas
    for await (const partial of soResult.response.fullStream) {
      if (partial.type === "text-delta" && typeof partial.textDelta === "string") {
        accumulatedText += partial.textDelta;
        console.log("Partial Text Delta:", partial.textDelta);
      }
    }

    // Remove Markdown JSON fences if any
    const jsonText = accumulatedText
      .replace(/```/g, "")
      .trim();

    // Parse the accumulated JSON text
    const parsedOutput = JSON.parse(jsonText);

    console.log("Final Parsed Structured Output:", parsedOutput);

  } catch (err) {
    console.error("Error during streaming structured output call:", err);
  }
}

runStreamingStructuredOutput();
