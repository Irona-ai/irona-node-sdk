/**
 * Utility to normalize tools from different sources (Composio, custom, etc.)
 * to ensure compatibility with Vercel AI SDK
 */

/**
 * Checks if a value is a Zod schema object
 */
function isZodSchema(value: any): boolean {
  return value && typeof value === 'object' && '_def' in value;
}

/**
 * Checks if a value is a JSON schema object
 */
function isJsonSchema(value: any): boolean {
  return (
    value &&
    typeof value === 'object' &&
    ('type' in value || 'properties' in value || '$schema' in value)
  );
}

/**
 * Normalizes tools to ensure they're compatible with Vercel AI SDK
 *
 * This function handles:
 * - Composio tools (which may use different schema formats)
 * - Custom Zod-based tools
 * - JSON Schema based tools
 *
 * @param tools - Tools object to normalize
 * @returns Normalized tools object safe to pass to Vercel AI SDK
 */
export function normalizeTools(tools: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!tools || typeof tools !== 'object') {
    return tools;
  }

  const normalized: Record<string, any> = {};

  for (const [toolName, tool] of Object.entries(tools)) {
    if (!tool || typeof tool !== 'object') {
      // Skip invalid tools
      console.warn(`[toolsNormalizer] Skipping invalid tool: ${toolName}`);
      continue;
    }

    normalized[toolName] = { ...tool };

    // If the tool has parameters, ensure they're in a format Vercel AI SDK can handle
    if ('parameters' in tool) {
      const params = tool.parameters;

      // Check if parameters is already a Zod schema - these are fine as-is
      if (isZodSchema(params)) {
        // Zod schema - pass through as-is
        normalized[toolName].parameters = params;
      }
      // Check if it's a JSON schema
      else if (isJsonSchema(params)) {
        // JSON schema - pass through as-is
        // Vercel AI SDK can handle JSON schemas directly
        normalized[toolName].parameters = params;
      }
      // Handle edge case: parameters might be wrapped or have unexpected structure
      else if (typeof params === 'object') {
        // Try to extract the actual schema if it's wrapped
        if ('schema' in params) {
          normalized[toolName].parameters = params.schema;
        } else if ('inputSchema' in params) {
          normalized[toolName].parameters = params.inputSchema;
        } else {
          // Assume it's already in the right format
          normalized[toolName].parameters = params;
        }
      }
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * Validates that tools have the minimum required structure
 */
export function validateToolsStructure(tools: Record<string, any> | undefined): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!tools) {
    return { valid: true, errors: [] };
  }

  if (typeof tools !== 'object') {
    errors.push('Tools must be an object');
    return { valid: false, errors };
  }

  for (const [toolName, tool] of Object.entries(tools)) {
    if (!tool || typeof tool !== 'object') {
      errors.push(`Tool "${toolName}" must be an object`);
      continue;
    }

    // Check for required properties (description is recommended but not strictly required)
    if ('parameters' in tool) {
      const params = tool.parameters;
      if (!params || (typeof params !== 'object' && typeof params !== 'function')) {
        errors.push(`Tool "${toolName}" has invalid parameters`);
      }
    }

    // Execute function is optional (for tools that only provide schema for LLM reasoning)
    if ('execute' in tool && typeof tool.execute !== 'function') {
      errors.push(`Tool "${toolName}" execute must be a function`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
