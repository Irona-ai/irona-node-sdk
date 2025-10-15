/**
 * Integration test to reproduce the def.shape error with real Composio tools
 * This test requires COMPOSIO_API_KEY to be set
 */

import { VercelAIToolSet } from '@composio/core';

describe('Composio Real Integration - def.shape error reproduction', () => {
  // Skip if no API key is provided
  const hasApiKey = !!process.env.COMPOSIO_API_KEY;

  (hasApiKey ? it : it.skip)('reproduces and tests fix for def.shape error', async () => {
    const toolset = new VercelAIToolSet({
      apiKey: process.env.COMPOSIO_API_KEY,
    });

    // Get real Linear tools from Composio
    const tools = await toolset.getTools({
      apps: ['linear'],
    });

    console.log('Composio tools structure:', JSON.stringify(tools, null, 2));

    // Check the structure of the tools
    expect(tools).toBeDefined();
    expect(typeof tools).toBe('object');

    // Inspect the tool parameters structure
    const firstToolKey = Object.keys(tools)[0];
    if (firstToolKey) {
      const firstTool = tools[firstToolKey];
      console.log('First tool:', firstToolKey);
      console.log('Tool structure:', {
        hasDescription: 'description' in firstTool,
        hasParameters: 'parameters' in firstTool,
        hasExecute: 'execute' in firstTool,
        parametersType: typeof firstTool.parameters,
      });

      // Check if parameters is a Zod schema or JSON schema
      if (firstTool.parameters) {
        const params = firstTool.parameters as any;
        console.log('Parameters structure:', {
          hasDefShape: typeof params?._def?.shape === 'function',
          hasDef: '_def' in params,
          isZodObject: params?._def?.typeName === 'ZodObject',
          keys: Object.keys(params).slice(0, 5),
        });
      }
    }
  }, 30000);

  (hasApiKey ? it : it.skip)('inspects tool schema format', async () => {
    const toolset = new VercelAIToolSet({
      apiKey: process.env.COMPOSIO_API_KEY,
    });

    const tools = await toolset.getTools({
      apps: ['github'],
      actions: ['GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER'],
    });

    const toolKey = 'GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER';
    const tool = tools[toolKey];

    expect(tool).toBeDefined();

    // Deep inspection of the parameters
    console.log('Tool parameters inspection:');
    console.log('Type:', typeof tool.parameters);
    console.log('Constructor:', tool.parameters?.constructor?.name);

    // Try to access def.shape to see if it throws
    try {
      const params = tool.parameters as any;
      if (params._def) {
        console.log('Has _def:', true);
        console.log('_def keys:', Object.keys(params._def));

        if (typeof params._def.shape === 'function') {
          console.log('def.shape is a function');
        } else {
          console.log('def.shape is NOT a function:', typeof params._def.shape);
        }
      }
    } catch (error) {
      console.error('Error accessing def.shape:', error);
      throw error;
    }
  }, 30000);
});
