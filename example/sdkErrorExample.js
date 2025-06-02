const { IronaAI }  = require('ironaai');
const dotenv  = require('dotenv');
dotenv.config();

/**
 * Complete example demonstrating error handling and tracing with IronaAI
 */
async function ironaErrorTracingExample() {
  console.log("Starting IronaAI error tracing example...");
  
  try {
    // Create the IronaAI instance
    const ironaAI = await IronaAI.createInstance({
      // Optional - automatically loads from environment variable
      apiKey: process.env.IRONAAI_API_KEY,
      // Optional - specify fallback models
      fallback_models: ["openai/gpt-4o-mini", "anthropic/claude-3-haiku-20240307"]
    });
    
    console.log("IronaAI instance created successfully");
    
    // Make a completions request
    const result = await ironaAI.completions.create({
      // Define the user's message
      messages: [{ content: 'What is the golden ratio?', role: 'user' }],
      // Specify models to choose from - including some that might not exist to demonstrate error handling
      models: [
        "openai/gpt-4o-2024-05-13",  // Valid model
        "anthropic/claude-fictional", // Invalid model - will cause an error
        "google/gemini-1.5-pro-latest" // Valid model
      ],
      // Set the optimization criteria
      tradeoff: 'latency',
    });
    
    // Handle potential errors
    if ('error' in result) {
      //we can use this to check errors---1
      console.error('Error occurred:', result.error);
      //or we can use this to check errors---2
      console.error('Error:', result.error_trace);
      //or we can use this to check errors---3
      console.log('Result:', JSON.stringify(result, null, 2));
       
      // If there's an error trace, print it for detailed debugging
      if ('error_trace' in result && result.error_trace) {
        console.log('\n--- ERROR TRACE ---');
        result.error_trace.forEach((trace, index) => {
          console.log(`\nError ${index + 1}:`);
          console.log(`Provider: ${trace.provider || 'N/A'}`);
          console.log(`Model: ${trace.model || 'N/A'}`);
          console.log(`Error Message: ${trace.error}`);
        });
        console.log('------------------\n');
      }
      
      // Check if the operation recovered despite errors
      if (result.recovered) {
        console.log('Operation recovered using fallback models!');
        console.log('Using provider:', result.provider);
        console.log('Using model:', result.model);
        
        // Display the successful response
        if (result.response) {
          console.log('\n--- RECOVERED RESPONSE ---');
          console.log('Content:', result.response.content);
          console.log('--------------------------\n');
        }
      } else {
        console.log('Operation failed completely, no recovery possible.');
        return;
      }
    } else {
      // Success path - no errors occurred
      console.log('\n--- SUCCESS ---');
      console.log('Provider:', result.provider);
      console.log('Model:', result.model);
      console.log('Content:', result.response.content);
      console.log('---------------\n');
    }
    
    // Working with streaming responses
    console.log('\nTrying a streaming example...');
    const streamingResult = await ironaAI.completions.create({
      messages: [{ content: 'Write a short poem about error handling', role: 'user' }],
      models: ["openai/gpt-4o-mini"],
      stream: true
    });
    
    if ('error' in streamingResult) {
      console.error('Streaming error:', streamingResult.error);
      if (streamingResult.error_trace) {
        console.log('Error trace:', JSON.stringify(streamingResult.error_trace, null, 2));
      }
    } else {
      console.log('Streaming from provider:', streamingResult.provider);
      console.log('Streaming from model:', streamingResult.model);
      console.log('\n--- STREAMING RESPONSE ---');
      
      // Handle streaming response
      for await (const chunk of streamingResult.response) {
        process.stdout.write(chunk.content || '');
      }
      console.log('\n-------------------------\n');
    }
    
  } catch (unexpectedError) {
    // This should generally not happen with our new error handling system
    // but it's still good practice to have this safety net
    console.error('Unexpected error occurred:', unexpectedError);
  }
}

// Run the example
ironaErrorTracingExample().then(() => {
  console.log('Example completed');
}).catch(err => {
  console.error('Fatal error:', err);
});