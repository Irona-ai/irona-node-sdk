import { z } from "zod";
import { Config, ErrorResponse } from "../types";
import { IronaChatClient } from "../irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "../irona-router-client/IronaRouterClient";
import { validateSchema } from "../utils/requestValidator";
import { createCompletionsPayload } from "./utility.payload";

export type StructuredOutputRequest<T> = {
  messages: [{ role: "system" | "assistant" | "user"; content: string }, ...{ role: "system" | "assistant" | "user"; content: string }[]];
  llmProviders?: { provider: string; model: string }[];
  tradeoff?: 'cost' | 'speed' | 'quality';
  responseModel: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  maxRetries?: number;
}

export type StructuredOutputResponse<T> = {
  providers: { provider: string; model: string }[];
  session_id: string;
  value: T;
  partial?: boolean;
} | ErrorResponse;

// Helper function to parse structured responses
function parseStructuredResponse(content: string): any {
  console.debug('Attempting to parse content:', content);

  if (!content || content.trim().length === 0) {
    throw new Error('Empty content received');
  }

  const parseStrategies = [
    // Strategy 1: Handle streaming chunks
    (content: string) => {
      let jsonContent = content.trim();
      // Handle partial chunks by completing them
      if (!jsonContent.startsWith('{')) {
        jsonContent = '{' + jsonContent;
      }
      if (!jsonContent.endsWith('}')) {
        jsonContent = jsonContent + '}';
      }
      return JSON.parse(jsonContent);
    },

    // Strategy 2: Direct JSON parse with cleanup
    (content: string) => {
      const cleaned = content
        .trim()
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
        .replace(/^[^{]*?(\{.*\})[^}]*?$/, '$1'); // Extract JSON object
      return JSON.parse(cleaned);
    },

    // Strategy 3: Handle partial JSON accumulation
    (content: string) => {
      const matches = content.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g);
      if (!matches) throw new Error('No complete JSON objects found');
      
      // Try parsing each potential JSON object
      for (const match of matches) {
        try {
          return JSON.parse(match);
        } catch {
          continue;
        }
      }
      throw new Error('No valid JSON found in matches');
    }
  ];

  // Try each strategy and collect errors
  const errors: string[] = [];
  for (const strategy of parseStrategies) {
    try {
      const result = strategy(content);
      if (result && typeof result === 'object') {
        console.debug('Successfully parsed JSON:', result);
        return result;
      }
    } catch (error) {
      errors.push(`${error instanceof Error ? error.message : 'Unknown error'}`);
      continue;
    }
  }

  throw new Error(`All parsing strategies failed:\n${errors.join('\n')}`);
}

export async function handleStructuredOutput<T>(
  config: Config,
  ironaChatClient: IronaChatClient,
  ironaRouter: IronaRouterClient,
  request: StructuredOutputRequest<T>
): Promise<StructuredOutputResponse<T> | ReadableStream<StructuredOutputResponse<T>>> {
  try {
    // Add schema information to system message
    const messages: [{ role: "system" | "assistant" | "user"; content: string }, ...{ role: "system" | "assistant" | "user"; content: string }[]] = [
      {
        role: 'system' as const,
        content: `Respond with valid JSON matching this schema: ${JSON.stringify(request.responseModel.describe('Response schema'))}`
      },
      ...request.messages
    ];

// Update the completionsPayload section
const completionsPayload = createCompletionsPayload(request);


    const response = await ironaChatClient.completions(completionsPayload);
    
    if ('error' in response) {
      return {
        error: response.error,
        error_trace: response.error_trace || []
      };
    }

     // Handle streaming responses
     if (request.stream && response.response instanceof ReadableStream) {
      const reader = response.response.getReader();
      let buffer = '';
      let lastValidResponse: T | null = null;
      const decoder = new TextDecoder();
    
      return new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                if (buffer.trim()) {
                  try {
                    const finalParsed = parseStructuredResponse(buffer);
                    const finalValidation = request.responseModel.safeParse(finalParsed);
                    if (finalValidation.success) {
                      controller.enqueue({
                        providers: [{ provider: response.provider, model: response.model }],
                        session_id: `structured-output-stream-${Date.now()}`,
                        value: finalValidation.data as T,
                        partial: false
                      });
                    }
                  } catch (error) {
                    console.debug('Final chunk parse failed:', error);
                  }
                }
                break;
              }
    
              // Decode and accumulate content
              const chunk = decoder.decode(value, { stream: true });
              console.debug('Received chunk:', chunk);
              
              if (!chunk) continue;
              
              buffer += chunk;
    
              // Try to find complete JSON objects
              try {
                const parsed = parseStructuredResponse(buffer);
                const validationResult = request.responseModel.safeParse(parsed);
                
                if (validationResult.success) {
                  lastValidResponse = validationResult.data as T;
                  controller.enqueue({
                    providers: [{ provider: response.provider, model: response.model }],
                    session_id: `structured-output-stream-${Date.now()}`,
                    value: lastValidResponse,
                    partial: true
                  });
                  // Keep accumulating but remove parsed content
                  buffer = '';
                }
              } catch (error) {
                console.debug('Chunk parsing or validation failed:', error);
                // Continue accumulating if parse fails
              }
            }
            controller.close();
          } catch (error) {
            console.error('Stream processing error:', error);
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        },
        cancel() {
          reader.cancel();
        }
      });
    }

    // Handle non-streaming responses
    const responseContent = response.response?.content || '';
    console.debug('Raw response:', responseContent);

    try {
      const parsedContent = parseStructuredResponse(responseContent);
      const validationResult = request.responseModel.safeParse(parsedContent);

      if (!validationResult.success) {
        return {
          error: "Response validation failed",
          error_trace: [{
            provider: response.provider,
            model: response.model,
            error: validationResult.error.message
          }]
        };
      }

      return {
        providers: [{ provider: response.provider, model: response.model }],
        session_id: `structured-output-${Date.now()}`,
        value: validationResult.data as T
      };
    } catch (error) {
      return {
        error: `Failed to parse structured output: ${(error as Error).message}`,
        error_trace: [{
          provider: response.provider,
          model: response.model,
          error: `${(error as Error).message}\nRaw response: ${responseContent}`
        }]
      };
    }
  } catch (error) {
    return {
      error: `Structured output processing failed: ${(error as Error).message}`,
      error_trace: [{
        provider: null,
        model: null,
        error: (error as Error).message
      }]
    };
  }
}
