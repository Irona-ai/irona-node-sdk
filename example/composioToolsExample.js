const { IronaAI } = require("ironaai");
// Note: Install @composio/core with: npm install @composio/core
// const { VercelAIToolSet } = require("@composio/core");

/**
 * Example demonstrating how to use Composio tools with the IronaAI SDK.
 *
 * Composio provides 250+ pre-built tools for integrating with services like:
 * - GitHub (repos, issues, PRs)
 * - Linear (issues, projects)
 * - Gmail (send emails, search)
 * - Slack (send messages, channels)
 * - Salesforce (CRM operations)
 * - And many more...
 *
 * Installation:
 * npm install ironaai @composio/core
 *
 * Setup:
 * 1. Get your Composio API key from https://app.composio.dev
 * 2. Set COMPOSIO_API_KEY environment variable
 * 3. Connect your apps (GitHub, Linear, etc.) via Composio dashboard
 */

/**
 * Example 1: Using Composio GitHub Tools
 * This example shows how to use Composio's GitHub integration
 */
async function githubToolsExample() {
  console.log("\n=== Composio GitHub Tools Example ===");

  try {
    // Initialize Composio VercelAIToolSet
    // Uncomment when you have @composio/core installed:
    // const toolset = new VercelAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY });

    // Get GitHub tools from Composio
    // const tools = await toolset.getTools({ apps: ["github"] });

    // For demo purposes, we'll simulate the tools structure
    const tools = {
      GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER: {
        description: "Star a repository for the authenticated user",
        parameters: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "The account owner of the repository",
            },
            repo: {
              type: "string",
              description: "The name of the repository",
            },
          },
          required: ["owner", "repo"],
        },
      },
      GITHUB_CREATE_AN_ISSUE: {
        description: "Create an issue in a repository",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
          },
          required: ["owner", "repo", "title"],
        },
      },
    };

    // Initialize IronaAI SDK
    const ironaAI = await IronaAI.createInstance();

    // Use the tools with completions
    const response = await ironaAI.completions.create({
      messages: [
        {
          role: "user",
          content:
            'Star the repository "composiohq/composio" and create an issue titled "Feature Request: Add new integration"',
        },
      ],
      models: ["openai/gpt-4o-mini"],
      tools: tools,
      temperature: 0.7,
    });

    console.log("[Composio Example] Response:", response.response.content);
    console.log("[Composio Example] Note: In real usage, Composio will execute the GitHub API calls");
  } catch (error) {
    console.error("[Composio Example] Error:", error.message);
  }
}

/**
 * Example 2: Using Composio Linear Tools
 * This example shows how to use Composio's Linear integration for project management
 */
async function linearToolsExample() {
  console.log("\n=== Composio Linear Tools Example ===");

  try {
    // Get Linear tools from Composio
    // const toolset = new VercelAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY });
    // const tools = await toolset.getTools({ apps: ["linear"] });

    // Simulated Linear tools structure
    const tools = {
      LINEAR_CREATE_ISSUE: {
        description: "Create a new issue in Linear",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "The title of the issue" },
            description: { type: "string", description: "The description" },
            teamId: { type: "string", description: "The team ID" },
            priority: { type: "number", description: "Priority level (0-4)" },
          },
          required: ["title", "teamId"],
        },
      },
      LINEAR_UPDATE_ISSUE: {
        description: "Update an existing issue in Linear",
        parameters: {
          type: "object",
          properties: {
            issueId: { type: "string", description: "The issue ID" },
            title: { type: "string" },
            stateId: { type: "string" },
          },
          required: ["issueId"],
        },
      },
    };

    const ironaAI = await IronaAI.createInstance();

    const response = await ironaAI.completions.create({
      messages: [
        {
          role: "user",
          content:
            'Create three high-priority issues in Linear: "Setup CI/CD pipeline", "Add authentication tests", and "Update API documentation"',
        },
      ],
      models: ["openai/gpt-4o-mini"],
      tools: tools,
      temperature: 0.5,
    });

    console.log("[Composio Example] Response:", response.response.content);
  } catch (error) {
    console.error("[Composio Example] Error:", error.message);
  }
}

/**
 * Example 3: Using Multiple Composio Apps Together
 * This example shows how to combine tools from multiple services
 */
async function multiAppExample() {
  console.log("\n=== Composio Multi-App Example ===");

  try {
    // Get tools from multiple apps
    // const toolset = new VercelAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY });
    // const tools = await toolset.getTools({ apps: ["github", "linear", "slack"] });

    // Simulated multi-app tools
    const tools = {
      GITHUB_CREATE_AN_ISSUE: {
        description: "Create a GitHub issue",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            title: { type: "string" },
          },
          required: ["owner", "repo", "title"],
        },
      },
      LINEAR_CREATE_ISSUE: {
        description: "Create a Linear issue",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            teamId: { type: "string" },
          },
          required: ["title", "teamId"],
        },
      },
      SLACK_SEND_MESSAGE: {
        description: "Send a Slack message",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string" },
            text: { type: "string" },
          },
          required: ["channel", "text"],
        },
      },
    };

    const ironaAI = await IronaAI.createInstance();

    const response = await ironaAI.completions.create({
      messages: [
        {
          role: "user",
          content:
            'When a critical bug is reported in GitHub issue #123, create a corresponding Linear issue in the engineering team and notify the #bugs channel in Slack',
        },
      ],
      models: ["openai/gpt-4o-mini"],
      tools: tools,
      temperature: 0.5,
      maxTokens: 1000,
    });

    console.log("[Composio Example] Multi-app workflow response:");
    console.log(response.response.content);
  } catch (error) {
    console.error("[Composio Example] Error:", error.message);
  }
}

/**
 * Example 4: Streaming with Composio Tools
 * This example shows how to use streaming with Composio tools
 */
async function streamingWithComposioExample() {
  console.log("\n=== Composio Streaming Example ===");

  try {
    // const toolset = new VercelAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY });
    // const tools = await toolset.getTools({ apps: ["github"] });

    const tools = {
      GITHUB_SEARCH_REPOSITORIES: {
        description: "Search for repositories on GitHub",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Search query" },
            sort: { type: "string", description: "Sort field" },
          },
          required: ["q"],
        },
      },
    };

    const ironaAI = await IronaAI.createInstance();

    const response = await ironaAI.completions.create({
      messages: [
        {
          role: "user",
          content: "Search for the top 5 AI-related repositories on GitHub and summarize them",
        },
      ],
      models: ["openai/gpt-4o-mini"],
      tools: tools,
      stream: true,
      temperature: 0.7,
    });

    console.log("[Composio Example] Streaming response:");

    // Stream the response
    for await (const chunk of response.response.fullStream) {
      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.textDelta);
      } else if (chunk.type === "tool-call") {
        console.log(`\n[Tool Call] ${chunk.toolName}:`, JSON.stringify(chunk.args, null, 2));
      } else if (chunk.type === "tool-result") {
        console.log(`[Tool Result] ${chunk.toolName}:`, chunk.result);
      }
    }

    console.log("\n[Composio Example] Streaming completed");
  } catch (error) {
    console.error("[Composio Example] Error:", error.message);
  }
}

/**
 * Example 5: Real-world Workflow - Automated Issue Triaging
 * This example demonstrates a practical workflow for triaging GitHub issues
 */
async function issueTriagingWorkflow() {
  console.log("\n=== Composio Issue Triaging Workflow ===");

  try {
    // const toolset = new VercelAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY });
    // const tools = await toolset.getTools({
    //   apps: ["github", "linear", "slack"]
    // });

    const tools = {
      GITHUB_GET_ISSUE: {
        description: "Get details of a GitHub issue",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            issue_number: { type: "number" },
          },
          required: ["owner", "repo", "issue_number"],
        },
      },
      GITHUB_UPDATE_ISSUE: {
        description: "Update a GitHub issue",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            issue_number: { type: "number" },
            labels: { type: "array", items: { type: "string" } },
          },
          required: ["owner", "repo", "issue_number"],
        },
      },
      LINEAR_CREATE_ISSUE: {
        description: "Create a Linear issue",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            teamId: { type: "string" },
            priority: { type: "number" },
          },
          required: ["title", "teamId"],
        },
      },
      SLACK_SEND_MESSAGE: {
        description: "Send a Slack message",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string" },
            text: { type: "string" },
          },
          required: ["channel", "text"],
        },
      },
    };

    const ironaAI = await IronaAI.createInstance();

    const response = await ironaAI.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an automated issue triaging assistant. When you see a new GitHub issue:
1. Analyze the issue content and severity
2. Add appropriate labels to the GitHub issue
3. If it's a bug with severity high/critical, create a Linear issue in the engineering team
4. Notify the appropriate Slack channel
5. Provide a summary of actions taken`,
        },
        {
          role: "user",
          content: `New issue reported in composiohq/composio #456: "Application crashes when using Linear integration with large datasets"`,
        },
      ],
      models: ["openai/gpt-4o-mini"],
      tools: tools,
      temperature: 0.3,
      maxTokens: 1500,
    });

    console.log("[Composio Example] Triaging workflow completed:");
    console.log(response.response.content);
  } catch (error) {
    console.error("[Composio Example] Error:", error.message);
  }
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log("=== IronaAI + Composio Integration Examples ===");
  console.log("Demonstrating how to use Composio's 250+ tools with IronaAI SDK\n");
  console.log("Note: These examples use simulated tool definitions.");
  console.log("In production, use: const toolset = new VercelAIToolSet() from @composio/core\n");

  try {
    // Run examples sequentially
    await githubToolsExample();
    await linearToolsExample();
    await multiAppExample();
    await streamingWithComposioExample();
    await issueTriagingWorkflow();

    console.log("\n=== All Composio examples completed ===");
    console.log("\nTo use real Composio tools:");
    console.log("1. Install: npm install @composio/core");
    console.log("2. Get API key from: https://app.composio.dev");
    console.log("3. Set env var: export COMPOSIO_API_KEY=your_key");
    console.log("4. Connect your apps via Composio dashboard");
    console.log("5. Use: const toolset = new VercelAIToolSet()");
    console.log("6. Get tools: await toolset.getTools({ apps: ['github'] })");
  } catch (error) {
    console.error("Error running examples:", error);
  }
}

// Run the examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  githubToolsExample,
  linearToolsExample,
  multiAppExample,
  streamingWithComposioExample,
  issueTriagingWorkflow,
};