import { StructuredOutputRequest } from "./structuredOutput"; // update the path based on your project
//import { Config } from "./config"; // optional if needed

export function createCompletionsPayload<T>(request: StructuredOutputRequest<T>) {
  const schemaExample = `{
  "title": "string (movie title)",
  "year": "number (release year)",
  "director": "string (director's name)",
  "rating": "number (between 0-10)",
  "review": "string (detailed review text)",
  "pros": "string[] (array of positive points)",
  "cons": "string[] (array of negative points)"
}`;

  return {
    messages: [
      {
        role: 'system' as const,
        content: `You are a structured data assistant. Follow these rules strictly:
1. Return valid JSON only
2. Stream the response as complete JSON objects
3. Each chunk must be valid JSON
4. Match this exact schema:
${schemaExample}

Example:
{
  "title": "Movie Title",
  "year": 2024,
  "director": "Director Name",
  "rating": 8.5,
  "review": "A detailed review...",
  "pros": ["Pro 1", "Pro 2"],
  "cons": ["Con 1", "Con 2"]
}`
      },
      ...request.messages
    ] as [{ role: "system" | "assistant" | "user"; content: string }, ...{ role: "system" | "assistant" | "user"; content: string }[]],
    models: [...(request.llmProviders?.map(p => `${p.provider}/${p.model}`) || ['openai/gpt-3.5-turbo'])] as [string, ...string[]],
    temperature: request.temperature ?? 0.1,
    maxTokens: request.maxTokens ?? 4096,
    stream: request.stream,
    maxRetries: request.maxRetries ?? 2,
    kwargs: {
      tradeoff: request.tradeoff || 'quality',
      responseModel: request.responseModel.describe('Response model'),
      anthropic: request.llmProviders?.some(p => p.provider === 'anthropic') ? {
        max_tokens: request.maxTokens ?? 4096,
        model_params: {
          temperature: request.temperature ?? 0.1
        },
        response_format: { type: "json" }
      } : undefined
    }
  };
}
