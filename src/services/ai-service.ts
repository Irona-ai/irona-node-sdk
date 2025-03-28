import { z } from "zod";
import { StreamData } from "ai";
import { 
  AIServiceConfig, 
  ErrorResponse, 
  ToolDefinitions,
  WeatherSchema,
  RecipeSchema 
} from "../types";
import { ValidationError, FunctionCallError } from "../errors";

export class AIService {
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig = {}) {
    this.config = {
      defaultModel: config.defaultModel || "openai/gpt-4o-mini",
      ...config
    };
  }

  // Structured Output Generation
  async generateStructuredOutput<T extends z.ZodSchema>(
    prompt: string, 
    schema: T, 
    options: { 
      model?: string, 
      temperature?: number 
    } = {}
  ): Promise<z.infer<T> | ErrorResponse> {
    try {
      // Simulate AI generation (replace with actual AI call)
      const responseContent = JSON.stringify(this.mockStructuredResponse(schema));
      
      // Parse and validate the response
      const parsedResult = schema.parse(JSON.parse(responseContent));
      return parsedResult;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(`Validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  // Function Calling
  async executeFunctionCall(
    functionName: keyof typeof ToolDefinitions, 
    args: any
  ): Promise<any> {
    try {
      // Validate arguments against predefined schema
      const schema = ToolDefinitions[functionName].parameters;
      const validatedArgs = schema.parse(args);

      // Simulate function execution 
      return this.simulateFunctionExecution(functionName, validatedArgs);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(`Invalid function arguments: ${error.message}`);
      }
      throw new FunctionCallError(`Function call failed: ${(error as Error).message}`);
    }
  }

  // AI Streaming
  async createAIStream(prompt: string): Promise<AsyncGenerator<string>> {
    const streamableResponse = new StreamData();

    const simulateStream = async function*() {
      const mockResponses = [
        "Once upon a time, ",
        "in a world of artificial intelligence, ",
        "there was a curious AI that wanted to learn and grow."
      ];

      for (const response of mockResponses) {
        yield response;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    };

    return simulateStream();
  }

  // Mock Methods for Demonstration
  private mockStructuredResponse<T extends z.ZodSchema>(schema: T): any {
    if (schema._def === WeatherSchema._def) {
      return {
        temperature: 25,
        condition: "sunny",
        humidity: 60,
        windSpeed: 10
      };
    }
    if (schema._def === RecipeSchema._def) {
      return {
        name: "Chocolate Chip Cookies",
        ingredients: ["flour", "sugar", "chocolate chips"],
        cookingTime: 30,
        difficulty: "medium"
      };
    }
    throw new Error("Unsupported schema");
  }

  private simulateFunctionExecution(functionName: string, args: any): any {
    switch(functionName) {
      case 'getWeather':
        return {
          temperature: 25,
          condition: "sunny",
          humidity: 60,
          windSpeed: 10,
          location: args.location
        };
      case 'bookFlight':
        return {
          bookingConfirmation: `FLIGHT-${Math.random().toString(36).substr(2, 9)}`,
          destination: args.destination,
          date: args.date,
          passengerCount: args.passengerCount
        };
      default:
        throw new FunctionCallError(`Unsupported function: ${functionName}`);
    }
  }
}