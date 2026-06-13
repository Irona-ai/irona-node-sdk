const { IronaAI } = require('ironlabsai');
const { z } = require('zod');

/**
 * Example demonstrating how to use tools with the IronaAI SDK.
 * Tools allow the AI model to execute functions and provide structured responses.
 */

// Define custom tools for the AI to use
const tools = {
  // Weather tool
  weather: {
    description: 'Get the current weather in a location',
    inputSchema: z.object({
      location: z.string().describe('The location to get the weather for'),
    }),
    execute: async ({ location }) => {
      // This is a mock implementation - replace with actual weather API call
      console.log(`[Tools Example] Getting weather for ${location}`);
      return {
        location,
        temperature: 72 + Math.floor(Math.random() * 21) - 10, // Random temp between 62-82
        conditions: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
        humidity: Math.floor(Math.random() * 40) + 40, // Random humidity 40-80%
      };
    },
  },

  // Calculator tool
  calculator: {
    description: 'Perform mathematical calculations',
    inputSchema: z.object({
      expression: z
        .string()
        .describe('The mathematical expression to evaluate'),
    }),
    execute: async ({ expression }) => {
      console.log(`[Tools Example] Calculating: ${expression}`);
      try {
        // Note: In production, use a proper math parser instead of eval
        const result = Function('"use strict";return (' + expression + ')')();
        return { expression, result };
      } catch (error) {
        return { expression, error: 'Invalid mathematical expression' };
      }
    },
  },

  // Get current time tool
  getCurrentTime: {
    description: 'Get the current time in a specific timezone',
    inputSchema: z.object({
      timezone: z
        .string()
        .describe("The timezone (e.g., 'UTC', 'America/New_York')")
        .optional(),
    }),
    execute: async ({ timezone = 'UTC' }) => {
      console.log(`[Tools Example] Getting time for timezone: ${timezone}`);
      const date = new Date();
      return {
        timezone,
        time: date.toLocaleString('en-US', { timeZone: timezone }),
        timestamp: date.toISOString(),
      };
    },
  },
};

/**
 * Example 1: Using tools with model selection
 */
async function modelSelectWithTools() {
  console.log('\n=== Model Select with Tools Example ===');

  const sdkClient = await IronaAI.createInstance();

  try {
    const response = await sdkClient.modelSelect({
      messages: [
        {
          role: 'user',
          content:
            "What's the weather like in San Francisco and what time is it there?",
        },
      ],
      models: ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku-20240307'],
      tools: tools, // Note: modelSelect accepts tools but doesn't execute them (as per requirements)
      topkModels: 1,
    });

    console.log(
      '[Tools Example] Model selected:',
      JSON.stringify(response, null, 2)
    );
    console.log(
      "[Tools Example] Note: modelSelect accepts tools parameter but doesn't execute them yet"
    );
  } catch (error) {
    console.error(
      '[Tools Example] Error in modelSelect with tools:',
      error.message
    );
  }
}

/**
 * Example 2: Using tools with completions (non-streaming)
 */
async function completionsWithTools() {
  console.log('\n=== Completions with Tools Example (Non-streaming) ===');

  const sdkClient = await IronaAI.createInstance();

  try {
    const response = await sdkClient.completions.create({
      messages: [
        {
          role: 'user',
          content:
            "What's 15 * 23 + 42? Also, what's the current time in New York?",
        },
      ],
      models: ['openai/gpt-4o-mini'],
      tools: tools,
      temperature: 0.7,
      maxTokens: 500,
    });

    console.log('[Tools Example] Response:', response.response.content);
    console.log(
      '[Tools Example] Provider:',
      response.provider,
      'Model:',
      response.model
    );
  } catch (error) {
    console.error(
      '[Tools Example] Error in completions with tools:',
      error.message
    );
  }
}

/**
 * Example 3: Using tools with streaming completions
 */
async function streamingCompletionsWithTools() {
  console.log('\n=== Completions with Tools Example (Streaming) ===');

  const sdkClient = await IronaAI.createInstance();

  try {
    const response = await sdkClient.completions.create({
      messages: [
        {
          role: 'user',
          content:
            'Check the weather in London and calculate the average of these numbers: 45, 67, 23, 89, 12',
        },
      ],
      models: ['openai/gpt-4o-mini'],
      tools: tools,
      stream: true,
      temperature: 0.5,
    });

    console.log(
      '[Tools Example] Streaming response from',
      response.provider + '/' + response.model
    );

    // Consume the stream
    let fullResponse = '';
    for await (const chunk of response.response.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.textDelta);
        fullResponse += chunk.textDelta;
      } else if (chunk.type === 'tool-call') {
        console.log(
          '\n[Tools Example] Tool called:',
          chunk.toolName,
          'with args:',
          chunk.args
        );
      }
    }
    console.log('\n[Tools Example] Stream completed');
  } catch (error) {
    console.error(
      '[Tools Example] Error in streaming completions with tools:',
      error.message
    );
  }
}

/**
 * Example 4: Combining custom tools with web search
 */
async function toolsWithWebSearch() {
  console.log('\n=== Tools with Web Search Example ===');

  const sdkClient = await IronaAI.createInstance();

  try {
    const response = await sdkClient.completions.create({
      messages: [
        {
          role: 'user',
          content:
            'Search for the latest AI news and tell me what time it is in Tokyo',
        },
      ],
      models: ['openai/gpt-4o-mini'],
      tools: tools, // Custom tools
      search: true, // Enable web search (adds web search tool automatically)
      temperature: 0.7,
    });

    console.log('[Tools Example] Response with tools and web search:');
    console.log(response.response.content);
    console.log(
      '[Tools Example] Note: Both custom tools and web search tool were available'
    );
  } catch (error) {
    console.error(
      '[Tools Example] Error in tools with web search:',
      error.message
    );
  }
}

/**
 * Example 5: Using tools with fallback models
 */
async function toolsWithFallbacks() {
  console.log('\n=== Tools with Fallback Models Example ===');

  const sdkClient = await IronaAI.createInstance();

  try {
    const response = await sdkClient.completions.create({
      messages: [
        {
          role: 'user',
          content: 'Calculate 999 * 888 and get the weather in Paris',
        },
      ],
      models: ['openai/gpt-4-turbo'], // Primary model
      fallbackModels: [
        'openai/gpt-4o-mini',
        'anthropic/claude-3-haiku-20240307',
      ], // Fallbacks
      tools: tools,
      temperature: 0.5,
    });

    console.log('[Tools Example] Response with fallback support:');
    console.log(response.response.content);
    console.log(
      '[Tools Example] Used provider:',
      response.provider,
      'model:',
      response.model
    );
  } catch (error) {
    console.error(
      '[Tools Example] Error in tools with fallbacks:',
      error.message
    );
  }
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('=== IronaAI Tools Examples ===');
  console.log('Demonstrating how to use function calling tools with the SDK');

  try {
    // Run examples sequentially
    await modelSelectWithTools();
    await completionsWithTools();
    await streamingCompletionsWithTools();
    await toolsWithWebSearch();
    await toolsWithFallbacks();

    console.log('\n=== All examples completed ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run the examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  tools,
  modelSelectWithTools,
  completionsWithTools,
  streamingCompletionsWithTools,
  toolsWithWebSearch,
  toolsWithFallbacks,
};
