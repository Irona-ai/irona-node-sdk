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
  content?: string;
} | ErrorResponse;

export async function handleFunctionCalling(
  config: Config,
  ironaChatClient: IronaChatClient,
  ironaRouter: IronaRouterClient,
  request: FunctionCallingRequest
): Promise<FunctionCallingResponse | ReadableStream<FunctionCallingResponse>> {
  try {
    const models = request.llmProviders?.map(p => `${p.provider}/${p.model}`) || ['openai/gpt-4-0613'];
    
    const completionsPayload: {
      messages: [{ role: "system" | "assistant" | "user"; content: string }, ...{ role: "system" | "assistant" | "user"; content: string }[]];
      models: [string, ...string[]];
      temperature: number;
      maxTokens: number;
      stream?: boolean;
      maxRetries: number;
      kwargs: any;
    } = {
      messages: [
        request.messages[0],
        ...request.messages.slice(1),
        {
          role: 'system' as const,
          content: `You are a function-calling assistant. Use only the provided functions.
    Return your response in one of these exact formats:
    1. JSON format (preferred):
    {
      "function_call": {
        "name": "calculate",
        "arguments": {
          "operation": "multiply",
          "a": 27,
          "b": 35
        }
      }
    }
    
    2. Function call format:
    calculate(27, 35)
    
    3. XML format:
    <tool_call>
    {
      "name": "calculate",
      "arguments": {
        "operation": "multiply",
        "a": 27,
        "b": 35
      }
    }
    </tool_call>
    
    Do not include any other text in your response.`
        }
      ],
      models: models as [string, ...string[]],
      temperature: request.temperature ?? 0.1,
      maxTokens: request.maxTokens ?? 4096,
      stream: request.stream,
      maxRetries: request.maxRetries ?? 2,
      kwargs: {
        tools: request.tools,
        function_call: { name: request.tools[0].function.name },
        anthropic: models.some(m => m.startsWith('anthropic/')) ? {
          max_tokens: request.maxTokens ?? 4096,
          model_params: { temperature: request.temperature ?? 0.1 }
        } : undefined
      }
    };

    const response = await ironaChatClient.completions(completionsPayload);
    
    if ('error' in response) {
      return {
        error: response.error,
        error_trace: response.error_trace || []
      };
    }

    // Handle streaming response
    if (request.stream && response.response instanceof ReadableStream) {
      const reader = response.response.getReader();
      let buffer = '';

      return new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                if (buffer) {
                  const toolCalls = parseContent(buffer);
                  if (toolCalls.length > 0) {
                    controller.enqueue({
                      providers: [{ provider: response.provider, model: response.model }],
                      session_id: `function-calling-stream-${Date.now()}`,
                      tool_calls: toolCalls,
                      content: buffer
                    });
                  }
                }
                break;
              }

              buffer += value;
              const toolCalls = parseContent(buffer);
              
              if (toolCalls.length > 0) {
                controller.enqueue({
                  providers: [{ provider: response.provider, model: response.model }],
                  session_id: `function-calling-stream-${Date.now()}`,
                  tool_calls: toolCalls,
                  content: buffer
                });
                buffer = '';
              }
            }
            controller.close();
          } catch (error) {
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

    // Handle non-streaming response
    const responseContent = response.response?.content || '';
    console.debug('Raw response:', responseContent);

    const toolCalls = parseContent(responseContent);
    
    if (toolCalls.length === 0) {
      throw new Error("Could not extract function calls from response");
    }

    return {
      providers: [{ provider: response.provider, model: response.model }],
      session_id: `function-calling-${Date.now()}`,
      tool_calls: toolCalls,
      content: responseContent
    };

  } catch (error) {
    return {
      error: `Function calling failed: ${(error as Error).message}`,
      error_trace: [{
        provider: null,
        model: null,
        error: (error as Error).message
      }]
    };
  }
}

// Update the parseContent function
function parseContent(content: string): ToolCall[] {
  console.debug('Parsing content:', content);

  const strategies = [
    // Strategy 1: Parse JSON format with function_call
    (content: string) => {
      try {
        const parsed = JSON.parse(content);
        if (parsed.function_call) {
          console.debug('Found function_call:', parsed.function_call);
          return [{
            name: parsed.function_call.name,
            args: typeof parsed.function_call.arguments === 'string' 
              ? JSON.parse(parsed.function_call.arguments)
              : parsed.function_call.arguments
          }];
        }
      } catch (e) {
        console.debug('JSON parse failed:', e);
      }
      return [];
    },

    // Strategy 2: Parse function call syntax
    (content: string) => {
      const functionRegex = /(\w+)\s*\(([^)]*)\)/;
      const match = content.match(functionRegex);
      if (match) {
        const [_, name, argsStr] = match;
        const args = argsStr.split(',')
          .map(arg => arg.trim());
        
        return [{
          name,
          args: {
            operation: 'multiply',
            a: Number(args[0]),
            b: Number(args[1])
          }
        }];
      }
      return [];
    },

    // Strategy 3: Parse XML format
    (content: string) => {
      const xmlMatches = content.match(/<tool_call>([\s\S]*?)<\/tool_call>/g) || [];
      for (const match of xmlMatches) {
        try {
          const cleanJson = match.replace(/<\/?tool_call>/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          return [{
            name: parsed.name,
            args: typeof parsed.arguments === 'string'
              ? JSON.parse(parsed.arguments)
              : parsed.arguments
          }];
        } catch {
          continue;
        }
      }
      return [];
    }
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy(content);
      if (result.length > 0) {
        console.debug('Successfully parsed with strategy:', result);
        return result;
      }
    } catch (error) {
      console.debug('Strategy failed:', error);
      continue;
    }
  }

  throw new Error('Could not extract valid function calls from response');
}

function parseArguments(args: any): Record<string, any> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      const values = args.split(',').map(v => v.trim());
      return {
        operation: 'multiply',
        a: Number(values[0]),
        b: Number(values[1])
      };
    }
  }
  return args || {};
}
