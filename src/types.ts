import { ModelPayload } from "./validators/common.validators";
import { z } from "zod";
export type Config = {
  baseUrl?: string;
  apiKey?: string;
  fallback_models?: ModelPayload[];
};
export type ChatModelConfig = {
  apiKey: string;
  modelName: string;
  temperature?: number;
  maxRetries?: number;
  maxTokens?: number;
};

export type ErrorTrace = {
  provider: string | null;
  model: string | null;
  error: string;
}[];

export interface ErrorResponse {
  error: string;
  error_trace: ErrorTrace;
  recovered?: boolean;
}


export interface AIServiceConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}



export const WeatherSchema = z.object({
  temperature: z.number().describe("Temperature in Celsius"),
  condition: z.enum(["sunny", "cloudy", "rainy", "snowy"]).describe("Current weather condition"),
  humidity: z.number().min(0).max(100).describe("Humidity percentage"),
  windSpeed: z.number().describe("Wind speed in km/h")
});

export const RecipeSchema = z.object({
  name: z.string().describe("Name of the recipe"),
  ingredients: z.array(z.string()).describe("List of ingredients"),
  cookingTime: z.number().describe("Cooking time in minutes"),
  difficulty: z.enum(["easy", "medium", "hard"]).describe("Recipe difficulty level")
});

export const ToolDefinitions = {
  getWeather: {
    description: "Get the current weather for a specific location",
    parameters: z.object({
      location: z.string().describe("City or region name"),
      unit: z.enum(["celsius", "fahrenheit"]).optional()
    })
  },
  bookFlight: {
    description: "Book a flight ticket",
    parameters: z.object({
      destination: z.string().describe("Destination city"),
      date: z.string().describe("Travel date in YYYY-MM-DD format"),
      passengerCount: z.number().int().min(1).describe("Number of passengers")
    })
  }
};