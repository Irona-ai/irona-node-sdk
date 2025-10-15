import { normalizeTools, validateToolsStructure } from '../../../src/utils/toolsNormalizer';
import { z } from 'zod';

describe('toolsNormalizer', () => {
  describe('normalizeTools', () => {
    it('returns undefined for undefined input', () => {
      expect(normalizeTools(undefined)).toBeUndefined();
    });

    it('returns undefined for non-object input', () => {
      expect(normalizeTools(null as any)).toBeNull();
      expect(normalizeTools('string' as any)).toBe('string');
    });

    it('passes through Zod-based tools unchanged', () => {
      const zodTools = {
        testTool: {
          description: 'A test tool',
          parameters: z.object({
            param: z.string(),
          }),
          execute: async ({ param }: { param: string }) => ({ result: param }),
        },
      };

      const normalized = normalizeTools(zodTools);
      expect(normalized).toBeDefined();
      expect(normalized!.testTool.parameters).toBe(zodTools.testTool.parameters);
    });

    it('passes through JSON Schema tools unchanged', () => {
      const jsonSchemaTools = {
        testTool: {
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              param: { type: 'string' },
            },
            required: ['param'],
          },
          execute: async ({ param }: { param: string }) => ({ result: param }),
        },
      };

      const normalized = normalizeTools(jsonSchemaTools);
      expect(normalized).toBeDefined();
      expect(normalized!.testTool.parameters).toEqual(jsonSchemaTools.testTool.parameters);
    });

    it('handles Composio-style tools with wrapped schemas', () => {
      const composioTools = {
        TOOL_NAME: {
          description: 'Composio tool',
          parameters: {
            schema: z.object({
              param: z.string(),
            }),
          },
          execute: async ({ param }: { param: string }) => ({ result: param }),
        },
      };

      const normalized = normalizeTools(composioTools);
      expect(normalized).toBeDefined();
      expect(normalized!.TOOL_NAME.parameters).toBe(composioTools.TOOL_NAME.parameters.schema);
    });

    it('handles tools with inputSchema wrapper', () => {
      const wrappedTools = {
        testTool: {
          description: 'Tool with inputSchema',
          parameters: {
            inputSchema: z.object({
              param: z.string(),
            }),
          },
          execute: async ({ param }: { param: string }) => ({ result: param }),
        },
      };

      const normalized = normalizeTools(wrappedTools);
      expect(normalized).toBeDefined();
      expect(normalized!.testTool.parameters).toBe(wrappedTools.testTool.parameters.inputSchema);
    });

    it('skips invalid tools with warning', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const invalidTools = {
        validTool: {
          description: 'Valid',
          parameters: z.object({}),
        },
        invalidTool: null,
        anotherInvalid: 'string',
      };

      const normalized = normalizeTools(invalidTools as any);
      expect(normalized).toBeDefined();
      expect(normalized!.validTool).toBeDefined();
      expect(normalized!.invalidTool).toBeUndefined();
      expect(normalized!.anotherInvalid).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('returns undefined for empty tools object', () => {
      const normalized = normalizeTools({});
      expect(normalized).toBeUndefined();
    });

    it('handles tools without parameters', () => {
      const tools = {
        simpleTool: {
          description: 'A simple tool without parameters',
          execute: async () => ({ result: 'done' }),
        },
      };

      const normalized = normalizeTools(tools);
      expect(normalized).toBeDefined();
      expect(normalized!.simpleTool.description).toBe('A simple tool without parameters');
    });

    it('preserves execute functions', () => {
      const executeFunc = async ({ x }: { x: number }) => ({ result: x * 2 });
      const tools = {
        mathTool: {
          description: 'Math tool',
          parameters: z.object({ x: z.number() }),
          execute: executeFunc,
        },
      };

      const normalized = normalizeTools(tools);
      expect(normalized).toBeDefined();
      expect(normalized!.mathTool.execute).toBe(executeFunc);
    });
  });

  describe('validateToolsStructure', () => {
    it('validates undefined tools as valid', () => {
      const result = validateToolsStructure(undefined);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects non-object tools', () => {
      const result = validateToolsStructure('invalid' as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tools must be an object');
    });

    it('validates well-formed Zod tools', () => {
      const tools = {
        testTool: {
          description: 'Test',
          parameters: z.object({ x: z.string() }),
          execute: async ({ x }: { x: string }) => ({ result: x }),
        },
      };

      const result = validateToolsStructure(tools);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('validates well-formed JSON Schema tools', () => {
      const tools = {
        testTool: {
          description: 'Test',
          parameters: {
            type: 'object',
            properties: { x: { type: 'string' } },
          },
          execute: async ({ x }: { x: string }) => ({ result: x }),
        },
      };

      const result = validateToolsStructure(tools);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('detects tools with invalid structure', () => {
      const tools = {
        invalidTool: null,
      };

      const result = validateToolsStructure(tools as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool "invalidTool" must be an object');
    });

    it('detects tools with invalid parameters', () => {
      const tools = {
        badTool: {
          description: 'Bad',
          parameters: 'invalid',
        },
      };

      const result = validateToolsStructure(tools as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool "badTool" has invalid parameters');
    });

    it('detects tools with non-function execute', () => {
      const tools = {
        badExecute: {
          description: 'Bad execute',
          parameters: z.object({}),
          execute: 'not a function',
        },
      };

      const result = validateToolsStructure(tools as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool "badExecute" execute must be a function');
    });

    it('allows tools without execute function', () => {
      const tools = {
        schemaOnlyTool: {
          description: 'Schema only',
          parameters: z.object({ x: z.string() }),
        },
      };

      const result = validateToolsStructure(tools);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('collects multiple errors', () => {
      const tools = {
        badTool1: null,
        badTool2: {
          description: 'Bad',
          parameters: 123,
        },
        badTool3: {
          description: 'Bad execute',
          execute: 'not a function',
        },
      };

      const result = validateToolsStructure(tools as any);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});