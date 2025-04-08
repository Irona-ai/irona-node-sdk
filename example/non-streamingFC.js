import { IronaAI } from 'ironaai';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

async function nonStreamingFunctionCallingExample() {
  console.log("=== Non-streaming Function Calling Example ===");
  
  try {
    // Initialize the IronaAI client
    const ironaai = await IronaAI.createInstance({
      apiKey: process.env.IRONAAI_API_KEY,
    });

    // Define our tools with improved schema
    const tools = [
      {
        type: 'function',
        function: {
          name: 'calculate',
          description: 'Performs mathematical calculations with two numbers',
          parameters: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['add', 'subtract', 'multiply', 'divide'],
                description: 'The mathematical operation to perform'
              },
              a: {
                type: 'number',
                description: 'First number in the calculation'
              },
              b: {
                type: 'number',
                description: 'Second number in the calculation'
              }
            },
            required: ['operation', 'a', 'b']
          }
        }
      }
    ];

    // Define the LLMs with proper configuration
    const llmProviders = [
      { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      { provider: 'openai', model: 'gpt-4-0613' }
    ];

    // Make the request with proper configuration
    const result = await ironaai.create({
      messages: [
        { 
          role: 'system',
          content: 'You are a math assistant. When given calculations, use the calculate function to compute the result. Always format numbers as parameters a and b.'
        },
        { 
          role: 'user',
          content: 'Calculate 27 multiplied by 35'
        }
      ],
      llmProviders: llmProviders,
      tools: tools,
      temperature: 0.1,
      maxTokens: 4096, // Required for Anthropic
      maxRetries: 2
    });

    if ('error' in result) {
      console.error('Error:', result.error);
      if (result.error_trace) {
        result.error_trace.forEach(trace => {
          console.error(`Provider: ${trace.provider}, Model: ${trace.model}`);
          console.error(`Error: ${trace.error}\n`);
        });
      }
      return;
    }

    console.log('Session ID:', result.session_id);
    console.log('Provider used:', JSON.stringify(result.providers, null, 2));
    
    // Handle tool calls with improved error checking
    if (result.tool_calls?.length > 0) {
      for (const call of result.tool_calls) {
        if (call.name === 'calculate') {
          try {
            const { operation, a, b } = call.args;
            if (typeof a !== 'number' || typeof b !== 'number') {
              throw new Error('Invalid number parameters');
            }

            let calculationResult;
            switch (operation) {
              case 'add': calculationResult = a + b; break;
              case 'subtract': calculationResult = a - b; break;
              case 'multiply': calculationResult = a * b; break;
              case 'divide': 
                if (b === 0) throw new Error('Division by zero');
                calculationResult = a / b; 
                break;
              default: 
                throw new Error(`Unsupported operation: ${operation}`);
            }

            console.log(`Calculation: ${a} ${operation} ${b} = ${calculationResult}`);
          } catch (error) {
            console.error('Error executing calculation:', error.message);
          }
        }
      }
    } else {
      console.log('No tool calls received in the response');
    }

  } catch (error) {
    console.error('Unexpected error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the example
nonStreamingFunctionCallingExample().catch(console.error);