// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
import { Config } from '../../../src/types';
import {
  mockGenerateText,
  mockStreamText,
  setupSuccessfulGeneration,
  setupSuccessfulStream,
  getLastGenerateTextCall,
  getLastStreamTextCall
} from '../../mocks/ai-sdk.mock';
import { createMockRouterClient, setupRouterSuccess } from '../../mocks/router-client.mock';
import { createTestPayload, setupTestEnv, mockConsole } from '../../utils/test-helpers';
import {
  mockDoesModelSupportMediaTypes,
  mockDoesModelSupportWebSearch,
  resetSupportedModelsMocks
} from '../../mocks/supported-models.mock';
import { resetProviderUtilsMocks } from '../../mocks/provider-utils.mock';
import { z } from 'zod';

/**
 * Tests for Composio toolkit integration with IronaAI SDK
 *
 * Composio provides 250+ tools for integrating with external services like
 * GitHub, Gmail, Linear, Salesforce, etc.
 *
 * This test suite demonstrates how to use Composio tools with the IronaAI SDK.
 */
/**
 * Mock Composio tools that simulate the structure returned by
 * VercelAIToolSet.getTools({ apps: ["github"] })
 *
 * Composio tools are already in the Vercel AI SDK format, so they
 * can be passed directly to the SDK.
 */
const mockComposioGitHubTools = {
      GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER: {
        description: 'Star a repository for the authenticated user',
        parameters: z.object({
          owner: z.string().describe('The account owner of the repository'),
          repo: z.string().describe('The name of the repository'),
        }),
        execute: async ({ owner, repo }: { owner: string; repo: string }) => {
          console.log(`[Mock] Starring repository: ${owner}/${repo}`);
          return {
            success: true,
            message: `Successfully starred ${owner}/${repo}`,
          };
        },
      },
      GITHUB_CREATE_AN_ISSUE: {
        description: 'Create an issue in a repository',
        parameters: z.object({
          owner: z.string().describe('The account owner of the repository'),
          repo: z.string().describe('The name of the repository'),
          title: z.string().describe('The title of the issue'),
          body: z.string().optional().describe('The contents of the issue'),
        }),
        execute: async ({ owner, repo, title, body }: any) => {
          console.log(`[Mock] Creating issue in ${owner}/${repo}: ${title}`);
          return {
            success: true,
            issue_number: 123,
            html_url: `https://github.com/${owner}/${repo}/issues/123`,
          };
        },
      },
};

const mockComposioLinearTools = {
      LINEAR_CREATE_ISSUE: {
        description: 'Create a new issue in Linear',
        parameters: z.object({
          title: z.string().describe('The title of the issue'),
          description: z.string().optional().describe('The description of the issue'),
          teamId: z.string().describe('The team ID to create the issue in'),
          priority: z.number().optional().describe('Priority level (0-4)'),
        }),
        execute: async ({ title, description, teamId, priority }: any) => {
          console.log(`[Mock] Creating Linear issue: ${title} in team ${teamId}`);
          return {
            success: true,
            issue: {
              id: 'lin_123',
              title,
              description,
              url: 'https://linear.app/team/issue/lin-123',
            },
          };
        },
      },
      LINEAR_UPDATE_ISSUE: {
        description: 'Update an existing issue in Linear',
        parameters: z.object({
          issueId: z.string().describe('The ID of the issue to update'),
          title: z.string().optional().describe('The new title'),
          description: z.string().optional().describe('The new description'),
          stateId: z.string().optional().describe('The new state ID'),
        }),
        execute: async ({ issueId, title, description, stateId }: any) => {
          console.log(`[Mock] Updating Linear issue: ${issueId}`);
          return {
            success: true,
            issue: {
              id: issueId,
              title,
              description,
            },
          };
        },
      },
};

describe('Composio Tools Integration', () => {
  let client: IronaChatClient;
  let mockRouter: ReturnType<typeof createMockRouterClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSupportedModelsMocks();
    resetProviderUtilsMocks();
    setupTestEnv();
    mockConsole();

    mockRouter = createMockRouterClient();
    const config: Config = { apiKey: 'test-api-key' };
    client = new IronaChatClient(config, mockRouter);
  });

  describe('Composio VercelAIToolSet Integration', () => {
    it('works with Composio GitHub tools in completions', async () => {
      setupSuccessfulGeneration('Repository starred successfully!');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: mockComposioGitHubTools as any,
          messages: [
            {
              role: 'user',
              content: 'Star the repository "composiohq/composio"',
            },
          ],
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toEqual(mockComposioGitHubTools);
      expect(result.response.content).toBe('Repository starred successfully!');
    });

    it('works with Composio Linear tools in completions', async () => {
      setupSuccessfulGeneration('Issue created in Linear!');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: mockComposioLinearTools as any,
          messages: [
            {
              role: 'user',
              content: 'Create a high priority issue titled "Fix login bug" in team abc-123',
            },
          ],
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toEqual(mockComposioLinearTools);
      expect(result.response.content).toBe('Issue created in Linear!');
    });

    it('handles streaming with Composio tools', async () => {
      const mockStream = setupSuccessfulStream(['Creating ', 'GitHub ', 'issue...']);
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: mockComposioGitHubTools as any,
          stream: true,
          messages: [
            {
              role: 'user',
              content: 'Create an issue in composiohq/composio with title "Add new feature"',
            },
          ],
        })
      );

      const lastCall = getLastStreamTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toEqual(mockComposioGitHubTools);

      // Verify stream can be consumed
      const chunks = [];
      for await (const chunk of mockStream.fullStream) {
        if (chunk.type === 'text-delta') {
          chunks.push(chunk.textDelta);
        }
      }
      expect(chunks).toEqual(['Creating ', 'GitHub ', 'issue...']);
    });

    it('combines Composio tools with multiple toolsets', async () => {
      setupSuccessfulGeneration('Combined tools response');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      // Simulate combining GitHub and Linear tools
      const combinedTools = {
        ...mockComposioGitHubTools,
        ...mockComposioLinearTools,
      };

      const result = await client.completions(
        createTestPayload({
          tools: combinedTools as any,
          messages: [
            {
              role: 'user',
              content: 'Create a Linear issue and star the related GitHub repo',
            },
          ],
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toHaveProperty('GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER');
      expect(lastCall.tools).toHaveProperty('LINEAR_CREATE_ISSUE');
    });

    it('works with custom tools alongside Composio tools', async () => {
      setupSuccessfulGeneration('All tools available');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      // Custom tool
      const customWeatherTool = {
        weather: {
          description: 'Get weather information',
          parameters: z.object({
            location: z.string(),
          }),
          execute: async ({ location }: { location: string }) => ({
            location,
            temperature: 72,
          }),
        },
      };

      const combinedTools = {
        ...customWeatherTool,
        ...mockComposioGitHubTools,
      };

      const result = await client.completions(
        createTestPayload({
          tools: combinedTools as any,
          messages: [
            {
              role: 'user',
              content: 'Get weather in San Francisco and star a repo',
            },
          ],
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toHaveProperty('weather');
      expect(lastCall.tools).toHaveProperty('GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER');
    });
  });

  describe('Composio Tool Error Handling', () => {
    it('handles tools with missing execute function gracefully', async () => {
      setupSuccessfulGeneration('Tool without execute');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const toolsWithoutExecute = {
        GITHUB_TOOL: {
          description: 'A tool without execute function',
          parameters: z.object({
            param: z.string(),
          }),
          // Note: no execute function
        },
      };

      const result = await client.completions(
        createTestPayload({
          tools: toolsWithoutExecute as any,
        })
      );

      // Should still pass the tools to the SDK
      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toEqual(toolsWithoutExecute);
    });

    it('handles empty Composio toolset', async () => {
      setupSuccessfulGeneration('No Composio tools');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: {},
        })
      );

      const lastCall = getLastGenerateTextCall();
      expect(lastCall).toBeDefined();
      expect(lastCall.tools).toBeUndefined();
    });
  });

  describe('Real-world Composio Use Cases', () => {
    it('simulates GitHub repository automation workflow', async () => {
      setupSuccessfulGeneration('GitHub workflow completed');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: mockComposioGitHubTools as any,
          messages: [
            {
              role: 'user',
              content: 'Star the repository composiohq/composio and create an issue to request a new feature',
            },
          ],
        })
      );

      expect(result.response.content).toBe('GitHub workflow completed');
    });

    it('simulates Linear project management workflow', async () => {
      setupSuccessfulGeneration('Linear workflow completed');
      setupRouterSuccess(mockRouter);
      mockDoesModelSupportMediaTypes.mockReturnValue(true);

      const result = await client.completions(
        createTestPayload({
          tools: {
            LINEAR_CREATE_ISSUE: {
              description: 'Create a new issue',
              parameters: z.object({
                title: z.string(),
                teamId: z.string(),
              }),
              execute: async ({ title, teamId }: any) => ({
                success: true,
                issue: { id: 'lin_1', title },
              }),
            },
          } as any,
          messages: [
            {
              role: 'user',
              content: 'Create three issues: "Setup CI/CD", "Add tests", "Update docs" in team eng-123',
            },
          ],
        })
      );

      expect(result.response.content).toBe('Linear workflow completed');
    });
  });
});