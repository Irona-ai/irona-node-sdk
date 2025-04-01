import { z } from "zod";

/**
 * Schema definitions for structured output
 */

// Weather schema for structured weather data
export const WeatherSchema = z.object({
  temperature: z.number().describe("Temperature in Celsius"),
  condition: z.enum(["sunny", "cloudy", "rainy", "snowy"]).describe("Current weather condition"),
  humidity: z.number().min(0).max(100).describe("Humidity percentage"),
  windSpeed: z.number().describe("Wind speed in km/h")
});

export type Weather = z.infer<typeof WeatherSchema>;

// Recipe schema for structured recipe data
export const RecipeSchema = z.object({
  name: z.string().describe("Name of the recipe"),
  ingredients: z.array(z.string()).describe("List of ingredients"),
  cookingTime: z.number().describe("Cooking time in minutes"),
  difficulty: z.enum(["easy", "medium", "hard"]).describe("Recipe difficulty level")
});

export type Recipe = z.infer<typeof RecipeSchema>;

// Product schema for e-commerce product data
export const ProductSchema = z.object({
  id: z.string().describe("Product unique identifier"),
  name: z.string().describe("Product name"),
  price: z.number().positive().describe("Product price"),
  category: z.string().describe("Product category"),
  features: z.array(z.string()).describe("Product features"),
  inStock: z.boolean().describe("Whether the product is in stock")
});

export type Product = z.infer<typeof ProductSchema>;

// Person schema for user profile data
export const PersonSchema = z.object({
  name: z.string().describe("Person's full name"),
  age: z.number().int().positive().describe("Person's age"),
  occupation: z.string().describe("Person's occupation"),
  skills: z.array(z.string()).describe("Person's skills"),
  contactInfo: z.object({
    email: z.string().email().describe("Person's email address"),
    phone: z.string().optional().describe("Person's phone number")
  })
});

export type Person = z.infer<typeof PersonSchema>;