/**
 * Test the real PDF example with a mock Irona API key
 * to see what's actually being sent to the API
 */

// Set a mock API key just to bypass the validation
process.env.IRONAAI_API_KEY = 'test-key-123';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

const { IronaAI } = require("./dist/index.js");

const body = {
  messages: [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "url",
            url: "https://assets.anthropic.com/m/1cd9d098ac3e6467/original/Claude-3-Model-Card-October-Addendum.pdf",
          },
          filename: "document.pdf",
        },
        {
          type: "text",
          text: "write short title for it",
        },
      ],
    },
  ],
  models: ["openai/gpt-4o-mini"],  // Use gpt-4o-mini as requested
  stream: false,  // Disable streaming for clearer output
};

async function testPDFAttachment() {
  console.log('Creating SDK instance...');

  try {
    const sdkClient = await IronaAI.createInstance({
      apiKey: 'test-key-123'
    });

    console.log('\n' + '='.repeat(60));
    console.log('Testing PDF attachment with body:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(body, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('Calling completions.create()...');
    console.log('='.repeat(60));

    // Try to create a completion
    const { provider, model, response } = await sdkClient.completions.create(body);

    console.log(`\nProvider: ${provider}, Model: ${model}`);
    console.log('Response:', response);

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('Error occurred:');
    console.log('='.repeat(60));
    console.error('Error message:', error.message);

    // Try to extract more details about what went wrong
    if (error.stack) {
      console.log('\nError location in code:');
      const relevantLines = error.stack.split('\n').slice(0, 5);
      relevantLines.forEach(line => console.log(line));
    }

    // Check if it's an API error response
    if (error.response) {
      console.log('\nAPI Response Error:');
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

testPDFAttachment();