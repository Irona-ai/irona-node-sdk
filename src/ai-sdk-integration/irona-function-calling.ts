import { z } from "zod";
import { IronaAI } from "../index";
import { Config, ErrorResponse } from "../types";
import { ToolDefinitions, ToolName, ToolParameters, ToolResult } from "./tools";

/**
 * IronaFunctionCalling provides methods for AI-powered function calling
 */
export class IronaFunctionCalling {
  private ironaAI: IronaAI;
  private toolImplementations: Partial<{
    [K in ToolName]: (args: ToolParameters<K>) => Promise<ToolResult<K>>;
  }> = {};
  
  /**
   * Create a new IronaFunctionCalling instance
   * @param config Configuration options
   */
  constructor(config: Config = {}) {
    this.ironaAI = IronaAI.create(config);
    
    // Register default implementations for tools
    this.registerTool('getWeather', this.defaultWeatherImplementation);
    this.registerTool('bookFlight', this.defaultBookFlightImplementation);
    this.registerTool('searchProducts', this.defaultSearchProductsImplementation);
    this.registerTool('calculateDistance', this.defaultCalculateDistanceImplementation);
  }
  
  /**
   * Register a custom implementation for a tool
   * 
   * @param toolName Name of the tool to register
   * @param implementation Function that implements the tool
   */
  registerTool<T extends ToolName>(
    toolName: T,
    implementation: (args: ToolParameters<T>) => Promise<ToolResult<T>>
  ): void {
    this.toolImplementations[toolName] = implementation as any;
  }
  
  /**
   * Execute a function call with validated arguments
   * 
   * @param toolName Name of the tool to execute
   * @param args Arguments for the tool
   * @returns Result of the tool execution or error response
   */
  async execute<T extends ToolName>(
    toolName: T,
    args: unknown
  ): Promise<ToolResult<T> | ErrorResponse> {
    try {
      // Check if the tool exists
      if (!ToolDefinitions[toolName]) {
        throw new Error(`Unknown tool: ${toolName}`);
      }
      
      // Validate arguments against the tool's schema
      const schema = ToolDefinitions[toolName].parameters;
      const validatedArgs = schema.parse(args) as ToolParameters<T>;
      
      // Get the tool implementation
      const implementation = this.toolImplementations[toolName];
      if (!implementation) {
        throw new Error(`No implementation registered for tool: ${toolName}`);
      }
      
      // Execute the tool and return the result
      const result = await implementation(validatedArgs);
      return result as ToolResult<T>;
    } catch (error) {
      // Return error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: `Function execution failed: ${errorMessage}`,
        error_trace: [{
          provider: null,
          model: null,
          error: errorMessage
        }]
      };
    }
  }
  
  /**
   * Use AI to determine which tool should be used and with what parameters,
   * then execute that tool
   * 
   * @param userPrompt User prompt describing what they want to do
   * @param options Additional options for the request
   * @returns Result of the executed tool or error response
   */
  async runWithAI(
    userPrompt: string,
    options: {
      model?: string;
      temperature?: number;
      availableTools?: ToolName[];
    } = {}
  ): Promise<{toolName: ToolName, result: any} | ErrorResponse> {
    const {
      model = "openai/gpt-4o-mini",
      temperature = 0.2,
      availableTools = Object.keys(ToolDefinitions) as ToolName[]
    } = options;
    
    try {
      // Filter tool definitions to only include available tools
      const filteredTools = Object.entries(ToolDefinitions)
        .filter(([key]) => availableTools.includes(key as ToolName))
        .reduce((acc, [key, value]) => {
          return {...acc, [key]: value};
        }, {} as typeof ToolDefinitions);
        
      // Create system prompt that describes available tools
      const toolsDescriptions = Object.entries(filteredTools).map(([name, def]) => {
        return `Tool: ${name}\nDescription: ${def.description}\nParameters: ${JSON.stringify(def.parameters.shape)}`;
      }).join('\n\n');
      
      const systemPrompt = `You are an AI assistant that helps users by selecting the appropriate tool and parameters based on their request.
Available tools:

${toolsDescriptions}

Based on the user request, respond with a JSON object that includes:
1. "toolName": The name of the most appropriate tool to use
2. "parameters": An object containing the parameters for the tool

Only respond with valid JSON. Do not include any other text.`;

      // Create completion request
      const response = await this.ironaAI.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        models: [model],
        temperature
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
      
      const parsedContent = JSON.parse(content);
      const { toolName, parameters } = parsedContent;
      
      // Execute the selected tool
      const result = await this.execute(toolName, parameters);
      return { toolName, result };
    } catch (error) {
      // Return error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: `AI function selection failed: ${errorMessage}`,
        error_trace: [{
          provider: null,
          model: null,
          error: errorMessage
        }]
      };
    }
  }
  
  // Default tool implementations
  private defaultWeatherImplementation = async (args: ToolParameters<'getWeather'>): Promise<ToolResult<'getWeather'>> => {
    const { location, unit } = args;
    
    // Simulated weather data
    return {
      temperature: 23,
      condition: "sunny",
      humidity: 65,
      windSpeed: 10,
      location,
      unit: unit || "celsius"
    };
  };
  
  private defaultBookFlightImplementation = async (args: ToolParameters<'bookFlight'>): Promise<ToolResult<'bookFlight'>> => {
    const { origin, destination, date, passengerCount } = args;
    
    // Simulated flight booking
    return {
      bookingId: `BK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      origin,
      destination,
      date,
      passengerCount,
      totalPrice: 299.99 * passengerCount,
      confirmationCode: `CONF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    };
  };
  
  private defaultSearchProductsImplementation = async (args: ToolParameters<'searchProducts'>): Promise<ToolResult<'searchProducts'>> => {
    const { query, category, maxPrice, minRating } = args;
    
    // Simulated product search
    return {
      results: [
        {
          id: "prod-001",
          name: `${query} Premium Model`,
          price: 129.99,
          category: category || "Electronics",
          rating: 4.7
        },
        {
          id: "prod-002",
          name: `${query} Standard Edition`,
          price: 79.99,
          category: category || "Electronics",
          rating: 4.2
        },
        {
          id: "prod-003",
          name: `${query} Basic Version`,
          price: 49.99,
          category: category || "Electronics",
          rating: 3.9
        }
      ],
      totalResults: 3,
      filteredBy: {
        category,
        maxPrice,
        minRating
      }
    };
  };
  
  private defaultCalculateDistanceImplementation = async (args: ToolParameters<'calculateDistance'>): Promise<ToolResult<'calculateDistance'>> => {
    const { startLocation, endLocation, unit } = args;
    
    // Simulated distance calculation
    return {
      startLocation,
      endLocation,
      distance: 158.3,
      unit: unit || "km",
      estimatedTime: {
        byCar: "1 hour 45 minutes",
        byPublicTransport: "2 hours 30 minutes",
        byWalking: "31 hours 40 minutes"
      }
    };
  };
}