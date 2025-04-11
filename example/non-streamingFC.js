import { IronaAI } from 'ironaai';
import * as dotenv from 'dotenv';

dotenv.config();

async function testFunctionCalling() {
  const ironaai = await IronaAI.createInstance({
    apiKey: process.env.IRONAAI_API_KEY,
  });

  console.log('Testing function calling...');

  const result = await ironaai.create({
    messages: [
      { role: 'user', content: 'Calculate 27 multiplied by 35' }
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'calculate',
        description: 'Calculate mathematical operations',
        parameters: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['multiply'] },
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['operation', 'a', 'b']
        }
      }
    }],
    stream: false,
    llmProviders: [
      { provider: 'openai', model: 'gpt-4-0613' }
    ]
  });
  if('error' in result) {
      console.error('Error:', result.error_trace);
      console.error('Error:', result.error);
      return;
  }

  console.log('Result:', JSON.stringify(result, null, 2));
}

testFunctionCalling().catch(console.error);