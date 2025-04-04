import { z } from "zod";
import { Config, ErrorResponse } from "../types";
import { IronaChatClient } from "../irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "../irona-router-client/IronaRouterClient";
import { validateSchema } from "../utils/requestValidator";

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
} | ErrorResponse;

export async function handleStructuredOutput<T>(
  config: Config,
  ironaChatClient: IronaChatClient,
  ironaRouter: IronaRouterClient,
  request: StructuredOutputRequest<T>
): Promise<StructuredOutputResponse<T>> {
  try {
    // Convert Vercel-style request to Irona-style request
    const completionsPayload = {
      messages: request.messages,
      models: [...(request.llmProviders?.map(p => `${p.provider}/${p.model}`) || ['openai/gpt-3.5-turbo'])] as [string, ...string[]],
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      stream: request.stream,
      maxRetries: request.maxRetries,
      kwargs: {
        tradeoff: request.tradeoff || 'quality',
        responseModel: request.responseModel.describe('Response model'),
      }
    };

    // Call the completion endpoint
    const response = await ironaChatClient.completions(completionsPayload);
    
    // Check for errors
    if ('error' in response) {
      return {
        error: (response as { error: string }).error,
        error_trace: (response as { error_trace?: any[] }).error_trace || []
      };
    }

    // For streamed responses
    if (completionsPayload.stream && response.response) {
      // This would require custom handling for streaming structured outputs
      throw new Error("Streaming not yet implemented for structured outputs");
    }

    // Parse the response content using the schema
    try {
      const responseContent = response.response?.content || '';
      
      // Try to parse as JSON first
      let parsedContent;
      try {
        parsedContent = JSON.parse(responseContent);
      } catch (e) {
        // Extract JSON from markdown code blocks if needed
        const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }

      // Validate against the schema
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
          error: (error as Error).message
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