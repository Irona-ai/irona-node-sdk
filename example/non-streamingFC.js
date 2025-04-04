import { IronaAI } from 'ironaai';
import dotenv from 'dotenv';
dotenv.config();

async function nonStreamingFunctionCallingExample() {
  console.log("=== Non-streaming Function Calling Example ===");
  
  try {
    // Initialize the IronaAI client
    const ironaai = await IronaAI.createInstance({
      apiKey: process.env.IRONAAI_API_KEY,
    });

    // Define our tools
    const tools = [
      {
        'type': 'function',
        'function': {
          'name': 'calculate',
          'description': 'Performs a mathematical calculation',
          'parameters': {
            'type': 'object',
            'properties': {
              'operation': {
                'type': 'string',
                'enum': ['add', 'subtract', 'multiply', 'divide']
              },
              'a': {'type': 'number'},
              'b': {'type': 'number'}
            },
            'required': ['operation', 'a', 'b']
          }
        }
      }
    ];

    // Define the LLMs we'd like to route between
    const llmProviders = [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      { provider: 'openai', model: 'gpt-4o-2024-05-13' },
    ];

    // Make the request
    const result = await ironaai.create({
      messages: [
        { content: 'You are a helpful assistant that can do math calculations.', role: 'system' },
        { content: 'Calculate 27 * 35', role: 'user' }
      ],
      llmProviders: llmProviders,
      tools: tools
    });

    if ('error' in result) {
      console.error('Error:', result.error);
      console.error('Error trace:', result.error_trace);
    }
    else {
      console.log('Irona AI session ID:', result.session_id);
      console.log('LLM called:', result.providers);
      console.log('Tool calls:', result.tool_calls);
      
      // Simulate function execution
      if (result.tool_calls && result.tool_calls.length > 0) {
        const call = result.tool_calls[0];
        if (call.name === 'calculate') {
          const { operation, a, b } = call.args;
          let result;
          switch (operation) {
            case 'add': result = a + b; break;
            case 'subtract': result = a - b; break;
            case 'multiply': result = a * b; break;
            case 'divide': result = a / b; break;
            default: result = 'Unknown operation';
          }
          console.log(`Function output: ${a} ${operation} ${b} = ${result}`);
        }
      }
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

nonStreamingFunctionCallingExample();