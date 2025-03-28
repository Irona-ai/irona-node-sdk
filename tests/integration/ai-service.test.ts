// tests/ai-service.test.ts
import { describe, it, beforeEach, expect } from 'vitest';
import { AIService } from '../../src/services/ai-service';
import { WeatherSchema, RecipeSchema } from '../../src/types';
import { ValidationError } from '../../src/errors';

describe('AIService Integration', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
  });

  describe('Structured Output', () => {
    it('should generate weather structured output', async () => {
      const result = await aiService.generateStructuredOutput(
        'Describe the current weather in London',
        WeatherSchema
      );

      expect(result).toMatchObject({
        temperature: expect.any(Number),
        condition: expect.any(String),
        humidity: expect.any(Number),
        windSpeed: expect.any(Number),
      });
    });

    it('should generate recipe structured output', async () => {
      const result = await aiService.generateStructuredOutput(
        'Suggest a chocolate chip cookie recipe',
        RecipeSchema
      );

      expect(result).toMatchObject({
        name: expect.any(String),
        ingredients: expect.arrayContaining([expect.any(String)]),
        cookingTime: expect.any(Number),
        difficulty: expect.any(String),
      });
    });
  });

  describe('Function Calling', () => {
    it('should execute getWeather function', async () => {
      const result = await aiService.executeFunctionCall('getWeather', {
        location: 'Paris',
        unit: 'celsius',
      });

      expect(result).toHaveProperty('temperature');
      expect(result).toHaveProperty('location', 'Paris');
    });

    it('should execute bookFlight function', async () => {
      const result = await aiService.executeFunctionCall('bookFlight', {
        destination: 'New York',
        date: '2024-07-15',
        passengerCount: 2,
      });

      expect(result).toHaveProperty('bookingConfirmation');
      expect(result).toHaveProperty('destination', 'New York');
    });

    it('should throw validation error for invalid function arguments', async () => {
      await expect(
        aiService.executeFunctionCall('getWeather', { location: 123 })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('AI Streaming', () => {
    it('should create an AI stream', async () => {
      const stream = await aiService.createAIStream(
        'Write a short story about a robot'
      );

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toContain('artificial intelligence');
    });
  });
});

// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
