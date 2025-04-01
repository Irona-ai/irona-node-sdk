import { z } from "zod";

/**
 * Tool definitions for function calling
 */
export const ToolDefinitions = {
  getWeather: {
    description: "Get the current weather for a specific location",
    parameters: z.object({
      location: z.string().describe("City or region name"),
      unit: z.enum(["celsius", "fahrenheit"]).optional().default("celsius")
    })
  },
  
  bookFlight: {
    description: "Book a flight ticket",
    parameters: z.object({
      origin: z.string().describe("Departure city"),
      destination: z.string().describe("Destination city"),
      date: z.string().describe("Travel date in YYYY-MM-DD format"),
      passengerCount: z.number().int().min(1).describe("Number of passengers")
    })
  },
  
  searchProducts: {
    description: "Search for products in a catalog",
    parameters: z.object({
      query: z.string().describe("Search query"),
      category: z.string().optional().describe("Product category"),
      maxPrice: z.number().optional().describe("Maximum price"),
      minRating: z.number().min(1).max(5).optional().describe("Minimum product rating")
    })
  },
  
  calculateDistance: {
    description: "Calculate distance between two locations",
    parameters: z.object({
      startLocation: z.string().describe("Starting location"),
      endLocation: z.string().describe("Destination location"),
      unit: z.enum(["km", "miles"]).optional().default("km")
    })
  }
};

export type ToolName = keyof typeof ToolDefinitions;
export type ToolParameters<T extends ToolName> = z.infer<typeof ToolDefinitions[T]["parameters"]>;

// Define return types for tools
export type ToolResults = {
  getWeather: {
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
    location: string;
    unit: string;
  };
  
  bookFlight: {
    bookingId: string;
    origin: string;
    destination: string;
    date: string;
    passengerCount: number;
    totalPrice: number;
    confirmationCode: string;
  };
  
  searchProducts: {
    results: Array<{
      id: string;
      name: string;
      price: number;
      category: string;
      rating: number;
    }>;
    totalResults: number;
    filteredBy?: {
      category?: string;
      maxPrice?: number;
      minRating?: number;
    };
  };
  
  calculateDistance: {
    startLocation: string;
    endLocation: string;
    distance: number;
    unit: string;
    estimatedTime: {
      byCar: string;
      byPublicTransport: string;
      byWalking: string;
    };
  };
};

export type ToolResult<T extends ToolName> = ToolResults[T];