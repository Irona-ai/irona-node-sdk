# Composio Integration with IronaAI SDK

This document explains how to integrate Composio tools with the IronaAI SDK and addresses the `def.shape is not a function` error you may encounter.

## Overview

Composio provides 250+ pre-built tools for integrating with popular services like GitHub, Linear, Gmail, Slack, Salesforce, and more. The IronaAI SDK now fully supports Composio tools via the Vercel AI SDK integration.

## Installation

```bash
npm install ironaai composio-core
```

## Quick Start

```javascript
const { IronaAI } = require("ironaai");
const { VercelAIToolSet } = require("composio-core");

// Initialize Composio toolset
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY
});

// Get tools for specific apps
const tools = await toolset.getTools({ apps: ["github"] });

// Initialize IronaAI
const ironaAI = await IronaAI.createInstance();

// Use tools in completions
const response = await ironaAI.completions.create({
  messages: [{
    role: "user",
    content: 'Star the repository "composiohq/composio"'
  }],
  models: ["openai/gpt-4o-mini"],
  tools: tools,
  temperature: 0.7
});
```

## Understanding the `def.shape is not a function` Error

### Root Cause

The error `TypeError: def.shape is not a function` occurs when Composio tools use JSON Schema format instead of Zod schemas, but the Vercel AI SDK or Zod tries to access Zod-specific properties like `def.shape`.

### How Composio Tools Work

Composio's `VercelAIToolSet.getTools()` returns tools in a format compatible with Vercel AI SDK. The tools structure looks like:

```javascript
{
  GITHUB_STAR_A_REPOSITORY: {
    description: "Star a repository",
    parameters: z.object({
      owner: z.string(),
      repo: z.string()
    }),
    execute: async ({ owner, repo }) => {
      // Composio handles the actual API call
    }
  }
}
```

### Solution

The IronaAI SDK automatically handles both:
1. **Zod schemas**: Traditional tool definitions using `z.object()`
2. **JSON schemas**: Alternative schema format

No special configuration is needed - just pass the tools from Composio directly to the SDK.

## Common Use Cases

### 1. GitHub Integration

```javascript
const toolset = new VercelAIToolSet();
const tools = await toolset.getTools({ apps: ["github"] });

const response = await ironaAI.completions.create({
  messages: [{
    role: "user",
    content: "Create an issue titled 'Bug: Login fails' in the repo owner/repo"
  }],
  models: ["openai/gpt-4o-mini"],
  tools: tools
});
```

### 2. Linear Integration

```javascript
const tools = await toolset.getTools({ apps: ["linear"] });

const response = await ironaAI.completions.create({
  messages: [{
    role: "user",
    content: "Create a high priority issue: 'Fix authentication bug' in team abc-123"
  }],
  models: ["openai/gpt-4o-mini"],
  tools: tools
});
```

### 3. Multi-App Workflows

```javascript
// Combine tools from multiple apps
const tools = await toolset.getTools({
  apps: ["github", "linear", "slack"]
});

const response = await ironaAI.completions.create({
  messages: [{
    role: "user",
    content: `When a critical bug is reported in GitHub,
              create a Linear issue and notify #bugs channel in Slack`
  }],
  models: ["openai/gpt-4o-mini"],
  tools: tools
});
```

## Streaming with Composio Tools

```javascript
const tools = await toolset.getTools({ apps: ["github"] });

const response = await ironaAI.completions.create({
  messages: [{
    role: "user",
    content: "Search for AI-related repos and summarize the top 5"
  }],
  models: ["openai/gpt-4o-mini"],
  tools: tools,
  stream: true
});

for await (const chunk of response.response.fullStream) {
  if (chunk.type === 'text-delta') {
    process.stdout.write(chunk.textDelta);
  } else if (chunk.type === 'tool-call') {
    console.log(`Tool called: ${chunk.toolName}`);
  }
}
```

## Combining Custom Tools with Composio

You can mix custom tools with Composio tools:

```javascript
const { z } = require("zod");

// Get Composio tools
const composioTools = await toolset.getTools({ apps: ["github"] });

// Define custom tools
const customTools = {
  weather: {
    description: "Get weather information",
    parameters: z.object({
      location: z.string()
    }),
    execute: async ({ location }) => {
      // Your custom implementation
      return { location, temperature: 72 };
    }
  }
};

// Combine them
const allTools = { ...customTools, ...composioTools };

const response = await ironaAI.completions.create({
  messages: [{
    role: "user",
    content: "Get weather in SF and star a relevant climate repo"
  }],
  models: ["openai/gpt-4o-mini"],
  tools: allTools
});
```

## Tool Execution Flow

1. **User sends message** with tool-enabled completion request
2. **IronaAI SDK** passes tools to the selected LLM provider
3. **LLM decides** which tools to call based on the prompt
4. **Composio executes** the tool calls via its API
5. **Results return** to the LLM for processing
6. **Final response** is generated and sent back

## Environment Setup

```bash
# Required environment variables
export IRONAAI_API_KEY="sk_your_irona_key"
export COMPOSIO_API_KEY="your_composio_key"

# Provider API keys (as needed)
export OPENAI_API_KEY="your_openai_key"
export ANTHROPIC_API_KEY="your_anthropic_key"
export GOOGLE_API_KEY="your_google_key"
```

## Testing

The SDK includes comprehensive tests for Composio integration:

```bash
npm test -- --testPathPattern=composio-tools.test.ts
```

Tests cover:
- ✅ GitHub tools integration
- ✅ Linear tools integration
- ✅ Streaming with Composio tools
- ✅ Combining multiple toolsets
- ✅ Custom + Composio tools together
- ✅ Error handling
- ✅ Real-world workflows

## Examples

See `example/composioToolsExample.js` for complete working examples including:

1. GitHub repository automation
2. Linear project management
3. Multi-app workflows
4. Streaming responses
5. Automated issue triaging

Run the examples:

```bash
cd example
node composioToolsExample.js
```

## Troubleshooting

### Error: "Cannot find module 'composio-core'"

**Solution**: Install Composio
```bash
npm install composio-core
```

### Error: "COMPOSIO_API_KEY is required"

**Solution**: Get your API key from https://app.composio.dev and set it:
```bash
export COMPOSIO_API_KEY="your_key"
```

### Error: "Tool execution failed"

**Solution**: Ensure you've connected your apps (GitHub, Linear, etc.) via the Composio dashboard at https://app.composio.dev

### Error: "def.shape is not a function"

**Solution**: This should be automatically handled by the SDK. If you still see this:
1. Update to the latest version of `ironaai`
2. Ensure `composio-core` is up to date
3. Check that tools are being passed correctly (see examples above)

## Available Apps

Composio supports 250+ apps including:

- **Development**: GitHub, GitLab, Bitbucket, Linear, Jira
- **Communication**: Slack, Discord, Microsoft Teams, Gmail
- **CRM**: Salesforce, HubSpot, Pipedrive
- **Productivity**: Notion, Asana, Trello, Monday
- **Cloud**: AWS, Google Cloud, Azure
- **And many more...**

For the full list, visit: https://app.composio.dev/apps

## Resources

- [Composio Documentation](https://docs.composio.dev)
- [IronaAI SDK Documentation](https://docs.irona.ai)
- [Vercel AI SDK](https://ai-sdk.dev)
- [Example Code](../example/composioToolsExample.js)
- [Tests](../tests/unit/completions/composio-tools.test.ts)

## Support

For issues with:
- **Composio integration**: Open an issue in the IronaAI SDK repository
- **Composio tools themselves**: Contact Composio support
- **IronaAI SDK**: Visit https://docs.irona.ai or open a GitHub issue