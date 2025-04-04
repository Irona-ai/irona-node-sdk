import { IronaAI } from 'ironaai';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

async function nonStreamingStructuredOutputExample() {
  console.log("=== Non-streaming Structured Output Example ===");
  
  try {
    // Initialize the IronaAI client
    const ironaai = await IronaAI.createInstance({
      apiKey: process.env.IRONAAI_API_KEY,
    });

    // Define our structured output schema
    const movieReviewSchema = z.object({
      title: z.string(),
      director: z.string(),
      year: z.number().int(),
      rating: z.number().min(0).max(10),
      review: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    });

    // Define the LLMs we'd like to route between
    const llmProviders = [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      { provider: 'openai', model: 'gpt-4o-2024-05-13' },
    ];

    // Make the request
    const result = await ironaai.create({
      messages: [
        { content: 'You are a professional movie critic.', role: 'system' },
        { content: 'Write a review for the movie "Inception" from 2010.', role: 'user' }
      ],
      llmProviders: llmProviders,
      tradeoff: 'quality',
      responseModel: movieReviewSchema
    });

    if ('error' in result) {
      console.error('Error:', result.error);
      console.error('Error trace:', result.error_trace);
    }
    else {
      console.log('Irona AI session ID:', result.session_id);
      console.log('LLM called:', result.providers);
      console.log('Structured output:', result.value);
      
      // You can now work with the typed structured output
      const review = result.value;
      console.log(`\n${review.title} (${review.year}) - ${review.rating}/10`);
      console.log(`Directed by: ${review.director}`);
      console.log(`\nPROS:\n${review.pros.map(pro => `- ${pro}`).join('\n')}`);
      console.log(`\nCONS:\n${review.cons.map(con => `- ${con}`).join('\n')}`);
      console.log(`\n${review.review}`);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

nonStreamingStructuredOutputExample();