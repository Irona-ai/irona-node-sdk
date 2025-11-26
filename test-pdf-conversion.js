/**
 * Test script to debug PDF attachment conversion issue
 * This bypasses API calls to focus on the conversion logic
 */

const path = require('path');

// Load the built SDK directly
const distPath = path.join(__dirname, 'dist', 'index.js');
console.log('Loading SDK from:', distPath);

// Import the actual IronaChatClient class from source
const { IronaChatClient } = require('./src/irona-chat-client/IronaChatClient.ts');

// Create test message with PDF attachment
const testMessage = {
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
};

// The convertToVercelMessages method from IronaChatClient (private method simulation)
function convertToVercelMessages(messages) {
  return messages.map((message) => {
    const { role, content, name, toolCallId, toolName } = message;

    // Handle tool messages
    if (role === "tool") {
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: toolCallId || "",
            toolName: toolName || "",
            result: content,
          },
        ],
      };
    }

    // Handle assistant messages with tool calls
    if (role === "assistant" && message.tool_calls) {
      return {
        role: "assistant",
        content: [
          ...(content ? [{ type: "text", text: content }] : []),
          ...message.tool_calls.map((toolCall) => ({
            type: "tool-call",
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
          })),
        ],
      };
    }

    // Handle string content
    if (typeof content === "string") {
      return { role, content, ...(name && { name }) };
    }

    // Handle array content - THIS IS WHERE THE FIX SHOULD BE APPLIED
    if (Array.isArray(content)) {
      const vercelContent = content.map((part) => {
        console.log('\n--- Processing part:', JSON.stringify(part, null, 2));

        if (part.type === "text") {
          const result = { type: "text", text: part.text };
          console.log('Converted to:', JSON.stringify(result, null, 2));
          return result;
        } else if (part.type === "image_url") {
          const result = {
            type: "image",
            image: part.image_url.url,
          };
          console.log('Converted to:', JSON.stringify(result, null, 2));
          return result;
        } else if (part.type === "document") {
          // THIS IS THE CRITICAL PART - SHOULD USE 'url' not 'data'
          const result = {
            type: "file",
            url: part.source.url,  // Our fix: using 'url' instead of 'data'
            mediaType: "application/pdf",
          };
          console.log('Converted to:', JSON.stringify(result, null, 2));
          return result;
        } else if (part.type === "tool-result") {
          const result = {
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.result,
          };
          console.log('Converted to:', JSON.stringify(result, null, 2));
          return result;
        }
        console.log('Unknown part type, passing through:', part);
        return part;
      });

      return { role, content: vercelContent, ...(name && { name }) };
    }

    return message;
  });
}

console.log('=' .repeat(60));
console.log('Testing PDF attachment conversion');
console.log('=' .repeat(60));

console.log('\nOriginal message:');
console.log(JSON.stringify(testMessage, null, 2));

console.log('\n' + '=' .repeat(60));
console.log('Converting to Vercel AI SDK format...');
console.log('=' .repeat(60));

const converted = convertToVercelMessages([testMessage]);

console.log('\n' + '=' .repeat(60));
console.log('Final converted message:');
console.log('=' .repeat(60));
console.log(JSON.stringify(converted[0], null, 2));

console.log('\n' + '=' .repeat(60));
console.log('VERIFICATION:');
console.log('=' .repeat(60));

const filePart = converted[0].content.find(p => p.type === 'file');
if (filePart) {
  console.log('\n✅ File part found:');
  console.log('  - type:', filePart.type);
  console.log('  - url:', filePart.url || '❌ MISSING (this is the problem!)');
  console.log('  - data:', filePart.data || '(not present - correct for v5)');
  console.log('  - mediaType:', filePart.mediaType);

  if (filePart.url) {
    console.log('\n✅ SUCCESS: PDF attachment is correctly using "url" property!');
  } else if (filePart.data) {
    console.log('\n❌ ERROR: PDF attachment is still using "data" property (old v4 format)');
    console.log('This will cause the attachment to be ignored by Vercel AI SDK v5');
  }
} else {
  console.log('\n❌ ERROR: No file part found in converted message!');
}

console.log('\n' + '=' .repeat(60));
console.log('What Vercel AI SDK v5 expects for file attachments:');
console.log('=' .repeat(60));
console.log(`
{
  type: "file",
  url: "https://...",     // ← Required in v5 (was 'data' in v4)
  mediaType: "..."        // ← Required in v5 (was 'mimeType' in v4)
}
`);