import { IronaAI } from 'ironaai';
import { z } from 'zod';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

async function nonStreamingCombinedExample() {
  console.log(chalk.blue("=== Non-streaming Combined Example ==="));
  
  try {
    const ironaai = await IronaAI.createInstance({
      apiKey: process.env.IRONAAI_API_KEY,
    });

    // Step 1: Function Calling
    const tools = [{
      type: 'function',
      function: {
        name: 'extractRecipeDetails',
        description: 'Extract recipe details from user query',
        parameters: {
          type: 'object',
          properties: {
            recipeName: { type: 'string' },
            cuisine: { type: 'string' },
            dietaryRestrictions: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['recipeName']
        }
      }
    }];

    // Use a single reliable model for testing
    const llmProviders = [
      { provider: 'openai', model: 'gpt-4-0613' }
    ];

    console.log(chalk.yellow("\nStep 1: Function Calling"));
    const fcResult = await ironaai.create({
      messages: [
        { 
          role: 'system',
          content: 'You are a cooking assistant. Extract recipe details using the provided function.'
        },
        { 
          role: 'user',
          content: 'I need a recipe for vegetarian pizza margherita.'
        }
      ],
      llmProviders,
      tools,
      temperature: 0.1
    });

    if ('error' in fcResult) {
      console.error(chalk.red('Function calling error:'), fcResult.error);
      return;
    }

    console.log(chalk.green('Function call successful:'), 
      JSON.stringify(fcResult.tool_calls[0], null, 2));
    
    // Step 2: Structured Output
    const recipeSchema = z.object({
      name: z.string(),
      cuisine: z.string(),
      prepTime: z.number(),
      cookTime: z.number(),
      ingredients: z.array(z.object({
        name: z.string(),
        amount: z.string(),
        optional: z.boolean().optional()
      })),
      instructions: z.array(z.string()),
      tips: z.array(z.string()).optional()
    });

    const recipeDetails = fcResult.tool_calls[0].args;
    
    console.log(chalk.yellow("\nStep 2: Structured Output"));
    const soResult = await ironaai.create({
      messages: [
        { 
          role: 'system',
          content: `You are a professional chef. Provide recipes in exact JSON format matching this schema:
{
  "name": "Recipe Name",
  "cuisine": "Cuisine Type",
  "prepTime": 15,
  "cookTime": 30,
  "ingredients": [
    { "name": "Ingredient", "amount": "1 cup", "optional": false }
  ],
  "instructions": ["Step 1", "Step 2"],
  "tips": ["Tip 1", "Tip 2"]
}`
        },
        { 
          role: 'user',
          content: `Generate a detailed recipe for ${recipeDetails.recipeName}. ` +
                  `Cuisine: ${recipeDetails.cuisine || 'Italian'}. ` +
                  `Dietary restrictions: ${(recipeDetails.dietaryRestrictions || ['vegetarian']).join(', ')}.`
        }
      ],
      llmProviders,
      responseModel: recipeSchema,
      temperature: 0.1
    });

    if ('error' in soResult) {
      console.error(chalk.red('Structured output error:'), soResult.error);
      return;
    }

    // Display results
    const recipe = soResult.value;
    console.log(chalk.green('\nRecipe Generated Successfully:'));
    console.log(chalk.cyan(`\n${recipe.name} (${recipe.cuisine})`));
    console.log(chalk.cyan(`Prep: ${recipe.prepTime}min | Cook: ${recipe.cookTime}min`));
    
    console.log(chalk.cyan('\nIngredients:'));
    recipe.ingredients.forEach(ing => {
      console.log(`- ${ing.amount} ${ing.name}${ing.optional ? ' (optional)' : ''}`);
    });
    
    console.log(chalk.cyan('\nInstructions:'));
    recipe.instructions.forEach((step, i) => {
      console.log(`${i+1}. ${step}`);
    });
    
    if (recipe.tips?.length) {
      console.log(chalk.cyan('\nChef\'s Tips:'));
      recipe.tips.forEach(tip => console.log(`- ${tip}`));
    }

  } catch (error) {
    console.error(chalk.red('Unexpected error:'), error);
  }
}

nonStreamingCombinedExample().catch(console.error);