import { IronaAI } from 'ironaai';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

async function nonStreamingCombinedExample() {
  console.log("=== Non-streaming Combined Structured Output & Function Calling Example ===");
  
  try {
    // Initialize the IronaAI client
    const ironaai = await IronaAI.createInstance({
      apiKey: process.env.IRONAAI_API_KEY,
    });

    // Step 1: Use function calling to extract a recipe from a query
    const tools = [
      {
        'type': 'function',
        'function': {
          'name': 'extractRecipeDetails',
          'description': 'Extract recipe details from user query',
          'parameters': {
            'type': 'object',
            'properties': {
              'recipeName': {'type': 'string'},
              'cuisine': {'type': 'string'},
              'dietaryRestrictions': {
                'type': 'array',
                'items': {'type': 'string'}
              }
            },
            'required': ['recipeName']
          }
        }
      }
    ];

    // Define the LLMs we'd like to route between
    const llmProviders = [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      { provider: 'openai', model: 'gpt-4o-2024-05-13' },
    ];

    // Make the function calling request
    console.log("First step: Function calling to extract recipe details");
    const fcResult = await ironaai.create({
      messages: [
        { content: 'You are a helpful cooking assistant.', role: 'system' },
        { content: 'I need a recipe for vegetarian pizza margherita.', role: 'user' }
      ],
      llmProviders: llmProviders,
      tools: tools
    });

    if ('error' in fcResult) {
      console.error('Error in function calling:', fcResult.error);
      return;
    }

    console.log('Function call result:', fcResult.tool_calls[0]);
    
    // Step 2: Use structured output to generate a detailed recipe
    // Define our structured output schema
    const recipeSchema = z.object({
      name: z.string(),
      cuisine: z.string(),
      prepTime: z.number().int(),
      cookTime: z.number().int(),
      ingredients: z.array(z.object({
        name: z.string(),
        amount: z.string(),
        optional: z.boolean().optional()
      })),
      instructions: z.array(z.string()),
      tips: z.array(z.string()).optional()
    });

    // Extract recipe details from function call
    const recipeDetails = fcResult.tool_calls[0].args;
    
    // Make the structured output request
    console.log("\nSecond step: Structured output to generate full recipe");
    const soResult = await ironaai.create({
      messages: [
        { content: 'You are a professional chef.', role: 'system' },
        { content: `Generate a detailed recipe for ${recipeDetails.recipeName}. ` +
                 `Cuisine: ${recipeDetails.cuisine || 'Any'}. ` +
                 `Dietary restrictions: ${(recipeDetails.dietaryRestrictions || ['None']).join(', ')}.`, 
          role: 'user' }
      ],
      llmProviders: llmProviders,
      responseModel: recipeSchema
    });

    if ('error' in soResult) {
      console.error('Error in structured output:', soResult.error);
      return;
    }

    // Display the results
    const recipe = soResult.value;
    console.log(`\n${recipe.name} (${recipe.cuisine})`);
    console.log(`Prep time: ${recipe.prepTime} minutes | Cook time: ${recipe.cookTime} minutes`);
    
    console.log('\nIngredients:');
    recipe.ingredients.forEach(ing => {
      console.log(`- ${ing.amount} ${ing.name}${ing.optional ? ' (optional)' : ''}`);
    });
    
    console.log('\nInstructions:');
    recipe.instructions.forEach((step, i) => {
      console.log(`${i+1}. ${step}`);
    });
    
    if (recipe.tips && recipe.tips.length > 0) {
      console.log('\nChef\'s Tips:');
      recipe.tips.forEach(tip => {
        console.log(`- ${tip}`);
      });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

nonStreamingCombinedExample();