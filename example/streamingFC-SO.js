import { IronaAI } from 'ironaai';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

async function testStreaming() {
  const ironaai = await IronaAI.createInstance({
    apiKey: process.env.IRONAAI_API_KEY,
  });

  // Test Function Calling Stream
  console.log(chalk.blue('\n=== Testing Function Calling Stream ==='));
  
  const calculateResult = await ironaai.create({
    messages: [
      { 
        role: 'system',
        content: `You are a calculation assistant. Follow these rules strictly:
1. Use only the calculate function to perform calculations
2. Return only valid JSON in this exact format:
{
  "function_call": {
    "name": "calculate",
    "arguments": {
      "operation": "multiply",
      "a": 27,
      "b": 35
    }
  }
}`
      },
      { 
        role: 'user', 
        content: 'Calculate 27 multiplied by 35' 
      }
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'calculate',
        description: 'Calculate mathematical operations',
        parameters: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['multiply'] },
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['operation', 'a', 'b']
        }
      }
    }],
    stream: true,
    llmProviders: [
      { provider: 'openai', model: 'gpt-4-0613' }
    ],
    temperature: 0.1
  });

  // Handle function calling stream
  if (calculateResult instanceof ReadableStream) {
    const reader = calculateResult.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      console.log(chalk.yellow('Streaming function calls...'));
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(chalk.green('\nFunction calling stream completed'));
          break;
        }

        // Decode chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        console.debug('Received raw chunk:', chunk);
        buffer += chunk;

        try {
          // Try to parse accumulated buffer
          const parsed = JSON.parse(buffer);
          if (parsed.function_call) {
            console.log(chalk.yellow('\nFunction Call:'));
            console.log(chalk.cyan('Name:'), parsed.function_call.name);
            console.log(chalk.cyan('Arguments:'), parsed.function_call.arguments);
            buffer = ''; // Clear buffer after successful parse
          }
        } catch (e) {
          // Continue accumulating if not valid JSON yet
          console.debug('Accumulating chunks...');
        }
      }
    } catch (error) {
      console.error(chalk.red('Stream error:'), error);
    } finally {
      reader.releaseLock();
    }
  } else {
    console.error(chalk.red('Error:'), calculateResult.error);
  }

  // Test Structured Output Stream
  console.log(chalk.blue('\n=== Testing Structured Output Stream ==='));

  const MovieSchema = z.object({
    title: z.string(),
    year: z.number(),
    director: z.string(),
    rating: z.number().min(0).max(10),
    review: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string())
  });

  const movieResult = await ironaai.create({
    messages: [
      { 
        role: 'system',
        content: `You are a movie reviewer. Return only valid JSON in this exact format:
{
  "title": "Movie Title",
  "year": 2024,
  "director": "Director Name",
  "rating": 8.5,
  "review": "Detailed movie review text...",
  "pros": ["Pro 1", "Pro 2"],
  "cons": ["Con 1", "Con 2"]
}
Do not include any other text or formatting.`
      },
      { 
        role: 'user', 
        content: 'Review the movie Inception' 
      }
    ],
    responseModel: MovieSchema,
    stream: true,
    llmProviders: [
      { provider: 'openai', model: 'gpt-4-0613' }
    ],
    temperature: 0.1
  });

  // Handle structured output stream
  if (movieResult instanceof ReadableStream) {
    const reader = movieResult.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      console.log(chalk.yellow('Streaming movie review...'));
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(chalk.green('\nStructured output stream completed'));
          break;
        }

        // Decode chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        console.debug('Received raw chunk:', chunk);
        buffer += chunk;

        try {
          // Try to parse accumulated buffer
          const parsed = JSON.parse(buffer);
          console.log(chalk.yellow('\nMovie Review Update:'));
          
          if (parsed.title) console.log(chalk.cyan('Title:'), parsed.title);
          if (parsed.year) console.log(chalk.cyan('Year:'), parsed.year);
          if (parsed.director) console.log(chalk.cyan('Director:'), parsed.director);
          if (parsed.rating) console.log(chalk.cyan('Rating:'), `${parsed.rating}/10`);
          
          if (parsed.pros?.length) {
            console.log(chalk.cyan('\nPros:'));
            parsed.pros.forEach(pro => console.log(chalk.green(`- ${pro}`)));
          }
          
          if (parsed.cons?.length) {
            console.log(chalk.cyan('\nCons:'));
            parsed.cons.forEach(con => console.log(chalk.red(`- ${con}`)));
          }
          
          if (parsed.review) {
            console.log(chalk.cyan('\nReview:'));
            console.log(parsed.review);
          }
          
          buffer = ''; // Clear buffer after successful parse
        } catch (e) {
          // Continue accumulating if not valid JSON yet
          console.debug('Accumulating chunks...');
        }
      }
    } catch (error) {
      console.error(chalk.red('Stream error:'), error);
    } finally {
      reader.releaseLock();
    }
  } else {
    console.error(chalk.red('Error:'), movieResult.error);
  }
}

// Add error handling
testStreaming().catch(error => {
  console.error(chalk.red('Error in streaming test:'), error);
  process.exit(1);
});