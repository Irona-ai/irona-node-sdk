// simpleDeepResearchTest.js
import { GoogleGenAI } from '@google/genai';

// Initialize the client with your API key
const client = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || 'AIzaSyD7w3DeNCwnELJRlaEVWIU9y1HYYLB29MY'
});

async function testStreamingResearch() {
  console.log('🔍 Testing Gemini Deep Research Agent (Streaming Mode)\n');
  
  // Hardcoded test query - modify this as needed
  const testQuery = "Research the impact of AI on climate change solutions in 2024. Provide key examples and companies involved.";
  
  console.log(`📝 Research Topic: ${testQuery}\n`);
  
  try {
    // Start the streaming research
    const stream = await client.interactions.create({
      input: testQuery,
      agent: 'deep-research-pro-preview-12-2025',
      background: true,
      stream: true,
      agent_config: {
        type: 'deep-research',
        thinking_summaries: 'auto'
      }
    });
    
    console.log('⏳ Research in progress...\n');
    console.log('='.repeat(60) + '\n');
    
    let interactionId;
    let output = '';
    let thoughtCounter = 1;
    
    for await (const chunk of stream) {
      if (chunk.event_type === 'interaction.start') {
        interactionId = chunk.interaction.id;
        console.log(`📋 Interaction ID: ${interactionId}\n`);
      }
      
      if (chunk.event_type === 'content.delta') {
        if (chunk.delta.type === 'text') {
          process.stdout.write(chunk.delta.text);
          output += chunk.delta.text;
        } else if (chunk.delta.type === 'thought_summary') {
          console.log(`\n\n💭 [Agent Thinking ${thoughtCounter++}]: ${chunk.delta.content.text}\n`);
        }
      } else if (chunk.event_type === 'interaction.complete') {
        console.log('\n\n' + '='.repeat(60));
        console.log('✅ Research Complete!');
        console.log(`📊 Total output: ${output.length} characters`);
        console.log(`🤔 Thoughts processed: ${thoughtCounter - 1}`);
        
        // Optional: Display summary stats
        const wordCount = output.split(/\s+/).length;
        const paragraphCount = (output.match(/\n\s*\n/g) || []).length + 1;
        
        console.log(`📈 Stats: ${wordCount} words, ${paragraphCount} paragraphs`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error during research:', error);
  }
}

// Run the test
testStreamingResearch();