# Function Calling / Tools Support

The IronaAI SDK now supports function calling (tools) with both custom tools and Composio's 250+ pre-built integrations.

## Quick Start

```javascript
const { IronaAI } = require("ironaai");
const { z } = require("zod");

const ironaAI = await IronaAI.createInstance();

// Define tools
const tools = {
  weather: {
    description: "Get weather information",
    parameters: z.object({
      location: z.string()
    }),
    execute: async ({ location }) => ({
      location,
      temperature: 72
    })
  }
};

// Use tools in completions
const response = await ironaAI.completions.create({
  messages: [{
    role: "user",
    content: "What's the weather in San Francisco?"
  }],
  models: ["openai/gpt-4o-mini"],
  tools: tools
});
```

## Composio Integration

Use 250+ pre-built tools for GitHub, Linear, Slack, Gmail, and more:

```javascript
const { VercelAIToolSet } = require("@composio/core");

const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY
});

// Get GitHub tools
const tools = await toolset.getTools({ apps: ["github"] });

// Use with IronaAI
const response = await ironaAI.completions.create({
  messages: [{
    role: "user",
    content: 'Star the repository "composiohq/composio"'
  }],
  models: ["openai/gpt-4o-mini"],
  tools: tools
});
```

## Features

- ✅ Custom tool definitions with Zod schemas
- ✅ Composio integration (250+ apps)
- ✅ JSON Schema support
- ✅ Streaming support
- ✅ Combine multiple toolsets
- ✅ Automatic schema normalization
- ✅ Web search tool integration

## Documentation

- [Complete Composio Integration Guide](./COMPOSIO_INTEGRATION.md)
- [Technical Implementation Details](./TOOLS_SUPPORT_SUMMARY.md)
- [Examples](../example/toolsExample.js)
- [Composio Examples](../example/composioToolsExample.js)

## Installation

```bash
# For custom tools
npm install ironaai zod

# For Composio integration
npm install ironaai @composio/core
```

## Examples

See the `/example` directory for complete working examples:
- `toolsExample.js` - Custom tools with Zod
- `composioToolsExample.js` - Composio integration examples