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

// Add new types for model-specific responses
type ModelResponse = {
  content: string;
  provider: string;
  model: string;
};

// Update the handleFunctionCalling function
export async function handleFunctionCalling(
  config: Config,
  ironaChatClient: IronaChatClient,
  ironaRouter: IronaRouterClient,
  request: FunctionCallingRequest
): Promise<FunctionCallingResponse> {
  try {
    const models = request.llmProviders?.map(p => `${p.provider}/${p.model}`) || ['openai/gpt-4-0613'];
    
    // Configure provider-specific settings
    const providerConfigs = {
      anthropic: {
        maxTokens: 4096,
        toolFormat: (tool: Tool) => ({
          type: 'function',
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        })
      },
      openai: {
        maxTokens: 1024,
        toolFormat: (tool: Tool) => tool
      }
    };

    // Prepare tools for each provider
    const tools = request.tools.map(tool => {
      const provider = models[0].split('/')[0];
      const config = providerConfigs[provider as keyof typeof providerConfigs] || providerConfigs.openai;
      return config.toolFormat(tool);
    });

    const completionsPayload = {
      messages: [
        ...request.messages,
        // Add explicit instruction for function calling
        {
          role: 'system' as const,
          content: 'Please use the provided functions to respond. Return your response in a structured format using either JSON or function call syntax.'
        }
      ] as [{ role: "system" | "assistant" | "user"; content: string }, ...{ role: "system" | "assistant" | "user"; content: string }[]],
      models: models as [string, ...string[]],
      temperature: request.temperature ?? 0.1, // Lower temperature for more consistent function calling
      maxTokens: request.maxTokens ?? 4096,
      stream: request.stream,
      maxRetries: request.maxRetries ?? 2,
      kwargs: {
        tools,
        function_call: { name: request.tools[0].function.name }, // Force function calling
        // Provider-specific configurations
        anthropic: models.some(m => m.startsWith('anthropic/')) ? {
          max_tokens: request.maxTokens ?? 4096,
          model_params: {
            temperature: request.temperature ?? 0.1
          }
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

    try {
      const responseContent = response.response?.content || '';
      console.log('Raw response:', responseContent); // Debug logging

      // Enhanced parsing strategies
      // Add more robust parsing strategies
const parseStrategies = [
  // Strategy 1: Handle Anthropic XML-style responses
  (content: string) => {
    if (content.includes('<tool_call>') || content.includes('<function_call>')) {
      const xmlMatches = content.match(/<(tool_call|function_call)>([\s\S]*?)<\/\1>/g);
      if (xmlMatches) {
        return xmlMatches.map(match => {
          const cleanJson = match.replace(/<\/?(?:tool_call|function_call)>/g, '').trim();
          try {
            const parsed = JSON.parse(cleanJson);
            return {
              name: parsed.name || parsed.function?.name,
              args: parseArguments(parsed.arguments || parsed.args || parsed.parameters)
            };
          } catch (e) {
            console.debug('XML parsing failed:', e);
            return null;
          }
        }).filter(Boolean);
      }
    }
    return null;
  },

  // Strategy 2: Handle direct JSON responses
  (content: string) => {
    try {
      // Try parsing the entire response first
      const parsed = JSON.parse(content);
      if (parsed.function_call || parsed.tool_calls) {
        return extractToolCalls(parsed);
      }
      // Check if the response itself is a function call
      if (parsed.name && (parsed.arguments || parsed.args)) {
        return [{
          name: parsed.name,
          args: parseArguments(parsed.arguments || parsed.args)
        }];
      }
    } catch {
      // If full parse fails, try finding JSON-like structures
      const jsonMatches = content.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            const parsed = JSON.parse(match);
            if (parsed.function_call || parsed.tool_calls || (parsed.name && (parsed.arguments || parsed.args))) {
              return extractToolCalls(parsed);
            }
          } catch {
            continue;
          }
        }
      }
    }
    return null;
  },

  // Strategy 3: Handle markdown code blocks
  (content: string) => {
    const codeBlocks = content.match(/```(?:json)?\s*([\s\S]*?)```/g);
    if (codeBlocks) {
      for (const block of codeBlocks) {
        try {
          const cleanJson = block.replace(/```(?:json)?\s*|\s*```/g, '');
          const parsed = JSON.parse(cleanJson);
          if (parsed.function_call || parsed.tool_calls || (parsed.name && (parsed.arguments || parsed.args))) {
            return extractToolCalls(parsed);
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }
];

      let toolCalls: ToolCall[] = [];
      
      // Try each parsing strategy
      // Add this before trying parsing strategies
console.log('=== Debug: Response Content ===');
console.log(responseContent);
console.log('===============================');

// Update the strategy loop
for (const strategy of parseStrategies) {
  try {
    console.log(`Trying parsing strategy...`);
    const result = strategy(responseContent);
    if (result && result.length > 0) {
      console.log('Strategy succeeded:', JSON.stringify(result, null, 2));
      toolCalls = result.filter((call): call is ToolCall => call !== null);
      break;
    }
    console.log('Strategy returned no results');
  } catch (error) {
    console.debug(`Strategy failed:`, error);
    continue;
  }
}

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
        error: `Failed to parse function calls: ${(error as Error).message}`,
        error_trace: [{
          provider: response.provider,
          model: response.model,
          error: `${(error as Error).message}\nResponse content: ${response.response?.content}`
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

// Helper function to parse arguments
// Helper function to extract tool calls from parsed response
function extractToolCalls(parsed: any): ToolCall[] {
  if (parsed.tool_calls) {
    return parsed.tool_calls.map((call: any) => ({
      name: call.function?.name || call.name,
      args: parseArguments(call.function?.arguments || call.arguments || call.args)
    }));
  }
  if (parsed.function_call) {
    return [{
      name: parsed.function_call.name,
      args: parseArguments(parsed.function_call.arguments || parsed.function_call.args)
    }];
  }
  return [];
}

function parseArguments(args: any): Record<string, any> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      // If JSON parsing fails, try to extract JSON-like structure
      const jsonMatch = args.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return { value: args };
        }
      }
      return { value: args };
    }
  }
  return args || {};
}