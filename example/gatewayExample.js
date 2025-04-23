import { IronaAI } from 'ironaai';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { z } from 'zod';

dotenv.config();

async function testGateway() {
  console.log(chalk.blue('=== Testing IronaAI Gateway ===\n'));

  const ironaai = await IronaAI.createInstance({
    apiKey: process.env.IRONAAI_API_KEY,
    router_id: process.env.IRONAAI_ROUTER_ID,
    tradeoff: 'quality',
    fallback_models: ['openai/gpt-4o-mini']
  });

  try {
    // Define response schema for structured output
    const ResponseSchema = z.object({
      description: z.string(),
      features: z.array(z.string()),
      benefits: z.array(z.string())
    });

    const response = await ironaai.create({
      messages: [
        { 
          role: 'system', 
          content: `You are a helpful assistant that explains AI platforms.
Return responses in this exact JSON format:
{
  "description": "Brief description of IronaAI...",
  "features": ["Feature 1", "Feature 2", "Feature 3"],
  "benefits": ["Benefit 1", "Benefit 2", "Benefit 3"]
}`
        },
        { role: 'user', content: 'What is IronaAI?' }
      ],
      responseModel: ResponseSchema,
      temperature: 0.7,
      maxTokens: 500,
      llmProviders: [
        { provider: 'openai', model: 'gpt-4o-mini' }
      ]
    });

    if ('error' in response) {
      // Try to extract useful information from validation error
      if (response.error_trace?.[0]?.error) {
        try {
          const validationErrors = JSON.parse(response.error_trace[0].error);
          console.error(chalk.red('\nValidation Errors:'));
          validationErrors.forEach((err) => {
            console.error(chalk.yellow(`- Field '${err.path}': ${err.message}`));
          });
        } catch {
          console.error(chalk.red('Error:'), response.error);
          console.error(chalk.yellow('Error trace:'), response.error_trace);
        }
      } else {
        console.error(chalk.red('Error:'), response.error);
        console.error(chalk.yellow('Error trace:'), response.error_trace);
      }
      return;
    }

    // Display structured response
    console.log(chalk.green('\nResponse received:'));
    console.log(chalk.cyan('\nDescription:'), response.value.description);
    
    console.log(chalk.cyan('\nFeatures:'));
    response.value.features.forEach(feature => {
      console.log(chalk.yellow(`• ${feature}`));
    });

    console.log(chalk.cyan('\nBenefits:'));
    response.value.benefits.forEach(benefit => {
      console.log(chalk.yellow(`• ${benefit}`));
    });

    console.log(chalk.cyan('\nProvider:'), response.providers[0].provider);
    console.log(chalk.cyan('Model:'), response.providers[0].model);

  } catch (error) {
    console.error(chalk.red('Unexpected error:'), error);
  }
}

// Add proper error handling for the main execution
console.log(chalk.yellow('Starting gateway test...'));
testGateway().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});