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
  
  const calculateStream = await ironaai.create({
    messages: [
      { 
        role: 'system',
        content: 'You are a calculation assistant. Use the calculate function to perform calculations.'
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

  // Handle function calling stream with robust error handling
  if (calculateStream instanceof ReadableStream) {
    const reader = calculateStream.getReader();
    
    try {
      console.log(chalk.yellow('Streaming function calls...'));
      let hasReceivedData = false;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (!hasReceivedData) {
            console.log(chalk.yellow('No function calls were streamed'));
          } else {
            console.log(chalk.green('\nFunction calling stream completed'));
          }
          break;
        }

        hasReceivedData = true;
        
        if (value) {
          if (value.tool_calls && value.tool_calls.length > 0) {
            console.log(chalk.yellow('\nFunction Call:'));
            console.log(chalk.cyan('Name:'), value.tool_calls[0].name);
            console.log(chalk.cyan('Arguments:'), JSON.stringify(value.tool_calls[0].args, null, 2));
          } else if (value.error) {
            console.error(chalk.red('Stream error:'), value.error);
            break;
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Stream error:'), error);
    } finally {
      reader.releaseLock();
    }
  } else if ('error' in calculateStream) {
    console.error(chalk.red('Error:'), calculateStream.error);
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

  const movieStream = await ironaai.create({
    messages: [
      { 
        role: 'system',
        content: 'You are a movie reviewer. Provide a detailed review of the specified movie in JSON format. Include title, year, director, rating, review, pros, and cons.'
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

  // Handle structured output stream with improved error handling
  if (movieStream instanceof ReadableStream) {
    const reader = movieStream.getReader();
    let hasReceivedData = false;
    
    try {
      console.log(chalk.yellow('Streaming movie review...'));
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (!hasReceivedData) {
            console.log(chalk.yellow('No structured data was streamed'));
          } else {
            console.log(chalk.green('\nStructured output stream completed'));
          }
          break;
        }

        hasReceivedData = true;
        
        if (value && value.value) {
          console.log(chalk.yellow('\nMovie Review Update:'));
          
          const parsed = value.value;
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
        } else if (value && value.error) {
          console.error(chalk.red('Stream error:'), value.error);
          break;
        }
      }
    } catch (error) {
      console.error(chalk.red('Stream error:'), error);
    } finally {
      reader.releaseLock();
    }
  } else if ('error' in movieStream) {
    console.error(chalk.red('Error:'), movieStream.error);
  }
}

// Add error handling
testStreaming().catch(error => {
  console.error(chalk.red('Error in streaming test:'), error);
  process.exit(1);
});