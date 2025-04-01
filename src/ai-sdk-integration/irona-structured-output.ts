import { z } from "zod";
import { IronaAI } from "../index";
import { Config, ErrorResponse } from "../types";
import { MissingApiKeyError } from "../errors";

/**
 * IronaStructuredOutput provides methods for generating AI responses
 * in structured formats defined by Zod schemas
 */
export class IronaStructuredOutput {
  private ironaAI: IronaAI;
  
  /**
   * Create a new IronaStructuredOutput instance
   * @param config Configuration options
   */
  constructor(config: Config = {}) {
    this.ironaAI = IronaAI.create(config);
  }
  
  /**
   * Generate a structured output based on a Zod schema
   * 
   * @param prompt The user prompt to generate structured data from
   * @param schema Zod schema that defines the expected output structure
   * @param options Configuration options for the request
   * @returns Structured data that matches the schema or an error response
   */
  async generate<T extends z.ZodSchema>(
    prompt: string,
    schema: T,
    options: {
      model?: string;
      temperature?: number;
      systemPrompt?: string;
      maxRetries?: number;
    } = {}
  ): Promise<z.infer<T> | ErrorResponse> {
    try {
      const {
        model = "openai/gpt-4o-mini",
        temperature = 0.2,
        systemPrompt = "You are a helpful assistant that generates structured data. Always respond with valid JSON that matches the requested schema.",
        maxRetries = 2
      } = options;
      
      const systemMessage = {
        role: "system" as const,
        content: `${systemPrompt}\n\nResponse Schema: ${JSON.stringify(schema.description || schema)}`
      };
      
      const userMessage = {
        role: "user" as const,
        content: prompt
      };
      
      // Create completion request
      const response = await this.ironaAI.completions.create({
        messages: [systemMessage, userMessage],
        models: [model],
        temperature,
        maxRetries
      });
      
      // Check for errors
      if ('error' in response) {
        return response as ErrorResponse;
      }
      
      // Parse the response content as JSON
      let content = response.response.content as string;
      // Try to extract JSON if it's wrapped in markdown code blocks
      if (content.includes('```json')) {
        content = content.split('```json')[1].split('```')[0].trim();
      } else if (content.includes('```')) {
        content = content.split('```')[1].split('```')[0].trim();
      }
      
      // Parse and validate against the schema
      const parsedContent = JSON.parse(content);
      const validatedData = schema.parse(parsedContent);
      
      return validatedData;
    } catch (error) {
      // If parsing or validation fails, return error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: `Structured output generation failed: ${errorMessage}`,
        error_trace: [{
          provider: null,
          model: null,
          error: errorMessage
        }]
      };
    }
  }
  
  /**
   * A convenience method to generate multiple structured outputs in parallel
   * 
   * @param requests Array of generation requests with prompts and schemas
   * @returns Array of results in the same order as the requests
   */
  async batchGenerate<T extends z.ZodSchema>(
    requests: Array<{
      prompt: string;
      schema: T;
      options?: {
        model?: string;
        temperature?: number;
        systemPrompt?: string;
        maxRetries?: number;
      };
    }>
  ): Promise<Array<z.infer<T> | ErrorResponse>> {
    const results = await Promise.all(
      requests.map(request => 
        this.generate(
          request.prompt,
          request.schema,
          request.options
        )
      )
    );
    
    return results;
  }
}