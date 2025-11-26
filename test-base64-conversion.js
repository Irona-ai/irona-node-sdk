#!/usr/bin/env node

/**
 * Test script to verify PDF base64 conversion for OpenAI
 */

// Set mock keys for testing
process.env.IRONAAI_API_KEY = 'test-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

const { IronaAI } = require('./dist/index.js');

// Test message with PDF URL
const testBody = {
  messages: [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "url",
            // Using a small test PDF URL
            url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          },
          filename: "test.pdf",
        },
        {
          type: "text",
          text: "What is in this PDF?",
        },
      ],
    },
  ],
  models: ["openai/gpt-4o-mini"],
  stream: false,
};

// Mock the actual API call to inspect what's being sent
const originalFetch = global.fetch;
global.fetch = async function(url, options) {
  console.log('\n' + '='.repeat(70));
  console.log('INTERCEPTED API CALL');
  console.log('='.repeat(70));
  console.log('URL:', url);

  if (options && options.body) {
    const body = JSON.parse(options.body);
    console.log('\nRequest Body:');
    console.log(JSON.stringify(body, null, 2));

    // Check if messages contain file attachments
    if (body.messages && body.messages[0] && body.messages[0].content) {
      const fileContent = body.messages[0].content.find(c => c.type === 'file');
      if (fileContent) {
        console.log('\n' + '='.repeat(70));
        console.log('FILE ATTACHMENT FOUND');
        console.log('='.repeat(70));
        console.log('Type:', fileContent.type);
        console.log('MediaType:', fileContent.mediaType);

        if (fileContent.url) {
          if (fileContent.url.startsWith('data:application/pdf;base64,')) {
            console.log('✅ URL Format: Base64 data URL (CORRECT for OpenAI)');
            console.log('Data URL prefix:', fileContent.url.substring(0, 50) + '...');
          } else if (fileContent.url.startsWith('http')) {
            console.log('❌ URL Format: HTTP URL (INCORRECT for OpenAI - should be base64)');
            console.log('URL:', fileContent.url);
          } else {
            console.log('⚠️  URL Format: Unknown');
          }
        } else if (fileContent.data) {
          console.log('❌ Using old "data" property instead of "url"');
        }
      }
    }
  }

  // Return a mock error to prevent actual API call
  throw new Error('Mock API call - test complete');
};

async function testBase64Conversion() {
  console.log('Testing PDF base64 conversion for OpenAI...\n');

  try {
    const sdkClient = await IronaAI.createInstance({
      apiKey: 'test-key'
    });

    console.log('SDK instance created successfully');
    console.log('\nAttempting to create completion with PDF attachment...');

    await sdkClient.completions.create(testBody);

  } catch (error) {
    if (error.message.includes('Mock API call')) {
      console.log('\n' + '='.repeat(70));
      console.log('TEST COMPLETE');
      console.log('='.repeat(70));
      console.log('\n✅ The test successfully intercepted the API call');
      console.log('Check the output above to verify:');
      console.log('1. PDF attachment was found in the message');
      console.log('2. It uses the "url" property (not "data")');
      console.log('3. The URL is a base64 data URL for OpenAI');
    } else if (error.message.includes('invalid') || error.message.includes('API key')) {
      console.log('\n⚠️  API key validation error (expected in test environment)');
      console.log('This test requires bypassing API key validation');
    } else {
      console.error('\n❌ Unexpected error:', error.message);
      if (error.stack) {
        console.log('\nError location:');
        const relevantLines = error.stack.split('\n').slice(0, 5);
        relevantLines.forEach(line => console.log(line));
      }
    }
  } finally {
    // Restore original fetch
    global.fetch = originalFetch;
  }
}

testBase64Conversion();