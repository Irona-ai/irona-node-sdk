```typescript
import { IronlabsAI } from 'ironlabsai';

const IronlabsAI = new IronlabsAI();

async function basicExample() {
  // 1. Select the best model
  const result = await IronlabsAI.completions.create({
    // Define the user's message
    messages: [{ content: 'What is the golden ratio?', role: 'user' }],
    // Specify the LLM providers and models to choose from
    llmProviders: [
      { provider: 'openai', model: 'gpt-4o-2024-05-13' },
      { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' },
      { provider: 'google', model: 'gemini-1.5-pro-latest' },
    ],
    // use either of the falling params:
    // fallbackModels: ['openai/gpt-4o-mini', 'anthropic/claude-3-5-turbo'],
    // or use
    fallbackProviders: [
      { provider: 'openai', model: 'gpt-3.5-turbo-20230111' },
      { provider: 'anthropic', model: 'claude-2-100k-20230111' },
      { provider: 'google', model: 'text-bison-001-20230111' },
    ],
    // timeout in seconds
    timeout: 10,
    // Set the optimization criteria to latency
    tradeoff: 'latency',
  });

  // 2. Handle potential errors
  if ('error' in result) {
    console.error('Error:', result.error);
    return;
  }

  // 3. Log the results
  // Display the text response
  console.log('LLM output:', result.content);
  // Display the selected provider(s)
  console.log('Selected providers:', result.providers);
}

basicExample();
```
