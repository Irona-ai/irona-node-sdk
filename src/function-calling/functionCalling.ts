import { Config, ErrorResponse } from "../types";
import { IronaChatClient } from "../irona-chat-client/IronaChatClient";
import { IronaRouterClient } from "../irona-router-client/IronaRouterClient";

export type Tool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
};

export type ToolCall = {
  name: string;
  args: Record<string, any>;
};

export type FunctionCallingRequest = {
  messages: [{ role: "system" | "assistant" | "user"; content: string }, ...{ role: "system" | "assistant" | "user"; content: string }[]];
  llmProviders?: { provider: string; model: string }[];
  tools: Tool[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  maxRetries?: number;
};

export type FunctionCallingResponse = {
  providers: { provider: string; model: string }[];
  session_id: string;
  tool_calls: ToolCall[];
  function_output?: any;
  content?: string;
} | ErrorResponse;

export async function handleFunctionCalling(
  config: Config,
  ironaChatClient: IronaChatClient,
  ironaRouter: IronaRouterClient,
  request: FunctionCallingRequest
): Promise<FunctionCallingResponse> {
  try {
    // Convert Vercel-style request to Irona-style request
    const models = request.llmProviders?.map(p => `${p.provider}/${p.model}`) || ['openai/gpt-3.5-turbo'];
    const completionsPayload = {
      messages: request.messages,
      models: models as [string, ...string[]],
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      stream: request.stream,
      maxRetries: request.maxRetries,
      kwargs: {
        tools: request.tools
      }
    };

    // Call the completion endpoint
    const response = await ironaChatClient.completions(completionsPayload) as { error?: string; error_trace?: any[]; response?: any; provider: string; model: string; };
    
    // Check for errors
    if (response.error) {
      return {
        error: response.error,
        error_trace: response.error_trace || []
      };
    }

    // For streamed responses
    if (completionsPayload.stream && response.response) {
      // This would require custom handling for streaming function calls
      throw new Error("Streaming not yet implemented for function calling");
    }

    try {
      const responseContent = response.response?.content || '';
      
      // Try to extract function calls from the response
      let toolCalls: ToolCall[] = [];
      
      // Try to parse as JSON directly
      try {
        // First check if the response is a direct JSON
        const parsed = JSON.parse(responseContent);
        if (parsed.tool_calls || parsed.function_call) {
          toolCalls = (parsed.tool_calls || [parsed.function_call]).map((call: any) => ({
            name: call.name || call.function?.name,
            args: call.arguments ? (typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments) : call.args
          }));
        }
      } catch (e) {
        // Try to extract from markdown code blocks or specific formats
        const functionMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (functionMatch) {
          try {
            const parsed = JSON.parse(functionMatch[1]);
            if (parsed.tool_calls || parsed.function_call) {
              toolCalls = (parsed.tool_calls || [parsed.function_call]).map((call: any) => ({
                name: call.name || call.function?.name,
                args: call.arguments ? (typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments) : call.args
              }));
            }
          } catch (innerError) {
            throw new Error(`Could not parse function calls from JSON in code block: ${(innerError as Error).message}`);
          }
        } else {
          throw new Error("Could not extract function calls from response");
        }
      }

      if (toolCalls.length === 0) {
        throw new Error("No function calls found in response");
      }

      return {
        providers: [{ provider: response.provider, model: response.model }],
        session_id: `function-calling-${Date.now()}`,
        tool_calls: toolCalls,
        content: responseContent
      };
    } catch (error) {
      return {
        error: `Failed to parse function calls: ${(error as Error).message}`,
        error_trace: [{
          provider: response.provider,
          model: response.model,
          error: (error as Error).message
        }]
      };
    }
  } catch (error) {
    return {
      error: `Function calling processing failed: ${(error as Error).message}`,
      error_trace: [{
        provider: null,
        model: null,
        error: (error as Error).message
      }]
    };
  }
}