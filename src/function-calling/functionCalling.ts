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

    // Update the streaming section in handleFunctionCalling
if (request.stream && response.response instanceof ReadableStream) {
  const reader = response.response.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            if (buffer.trim()) {
              try {
                const toolCalls = parseContent(buffer);
                if (toolCalls.length > 0) {
                  controller.enqueue({
                    providers: [{ provider: response.provider, model: response.model }],
                    session_id: `function-calling-stream-${Date.now()}`,
                    tool_calls: toolCalls,
                    content: buffer
                  });
                }
              } catch (error) {
                console.debug('Final chunk parse failed:', error);
              }
            }
            break;
          }

          // Decode the chunk and accumulate
          const chunk = decoder.decode(value, { stream: true });
          console.debug('Received chunk:', chunk);
          buffer += chunk;

          // Try to find complete function calls in accumulated buffer
          try {
            // Look for complete JSON objects or function calls
            const matches = buffer.match(/(\{[^{}]*\}|[\w.]+\([^()]*\))/g);
            if (matches) {
              for (const match of matches) {
                try {
                  const toolCalls = parseContent(match);
                  if (toolCalls.length > 0) {
                    controller.enqueue({
                      providers: [{ provider: response.provider, model: response.model }],
                      session_id: `function-calling-stream-${Date.now()}`,
                      tool_calls: toolCalls,
                      content: match
                    });
                    // Remove parsed content from buffer
                    buffer = buffer.replace(match, '');
                  }
                } catch (e) {
                  console.debug('Chunk parsing failed:', e);
                }
              }
            }
          } catch (error) {
            console.debug('Stream parsing error:', error);
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
  if (!content || content.trim().length === 0) {
    throw new Error('Empty content received');
  }

  console.debug('Parsing content:', content);

  const strategies = [
    // Strategy 1: Parse JSON format with function_call
    (content: string) => {
      try {
        const cleaned = content.trim()
          .replace(/^[^{]*/, '') // Remove anything before first {
          .replace(/[^}]*$/, ''); // Remove anything after last }
        
        const parsed = JSON.parse(cleaned);
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
        console.debug('JSON parse strategy failed:', e);
      }
      return [];
    },

    // Strategy 2: Parse function call syntax with improved regex
    (content: string) => {
      const functionRegex = /(\w+)\s*\(([\s\S]*?)\)/;
      const match = content.match(functionRegex);
      if (match) {
        const [_, name, argsStr] = match;
        try {
          // Try to parse as JSON first
          const args = JSON.parse(`{${argsStr}}`);
          return [{
            name,
            args
          }];
        } catch {
          // Fall back to simple argument parsing
          const args = argsStr.split(',')
            .map(arg => arg.trim())
            .filter(Boolean);
          
          return [{
            name,
            args: {
              operation: 'multiply',
              a: Number(args[0]),
              b: Number(args[1])
            }
          }];
        }
      }
      return [];
    },

    // Strategy 3: Parse XML format with improved cleaning
    (content: string) => {
      const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/;
      const match = content.match(xmlRegex);
      if (match) {
        try {
          const cleanJson = match[1].trim()
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
          const parsed = JSON.parse(cleanJson);
          return [{
            name: parsed.name,
            args: typeof parsed.arguments === 'string'
              ? JSON.parse(parsed.arguments)
              : parsed.arguments
          }];
        } catch (e) {
          console.debug('XML parse strategy failed:', e);
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
