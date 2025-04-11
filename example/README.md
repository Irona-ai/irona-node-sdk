# Error Handling Guide for IronaAI SDK
## Introduction
The IronaAI SDK uses a structured error handling approach that allows for:
- Catching and reporting errors without throwing exceptions
- Automatic fallback to alternative models when primary ones fail
- Comprehensive error tracing for debugging
This guide explains how to effectively handle errors when using the SDK.
## Error Response Structure
When an error occurs, methods return objects with the following structure:
```typescript
{
  error: string;             // Human-readable error message
  error_trace: [             // Array of all errors encountered
    {
      provider: string | null;  // The provider that caused the error (if applicable)
      model: string | null;     // The model that caused the error (if applicable)
      error: string;            // Detailed error message
    }
  ],
  recovered?: boolean;       // Present and true if operation recovered using fallbacks
  // If recovered is true, the usual success fields are also included:
  provider?: string;         // The provider that was ultimately used
  model?: string;            // The model that was ultimately used
  response?: any;            // The successful response
}
```
## Basic Error Handling
```typescript
const result = await ironaAI.completions.create({
  messages: [{ content: 'What is the golden ratio?', role: 'user' }],
  models: ["openai/gpt-4o", "anthropic/claude-3-opus"]
});
// Check for errors
if ('error' in result) {
  console.error('Error occurred:', result.error);
  // Handle the error appropriately
  // ...
  return;
}
// No errors - process the successful result
console.log('Success! Using provider:', result.provider);
console.log('Content:', result.response.content);
```
## Advanced Error Handling with Error Trace
The `error_trace` property provides detailed information about all errors encountered during request processing:
```typescript
const result = await ironaAI.completions.create({
  messages: [{ content: 'What is the golden ratio?', role: 'user' }],
  models: ["openai/gpt-4o", "anthropic/claude-3-opus"]
});
if ('error' in result) {
  console.error('Error:', result.error);
  // Access the error trace for detailed debugging
  if (result.error_trace) {
    result.error_trace.forEach((trace, index) => {
      console.log(`Error ${index + 1}:`);
      console.log(`Provider: ${trace.provider || 'N/A'}`);
      console.log(`Model: ${trace.model || 'N/A'}`);
      console.log(`Error Message: ${trace.error}`);
    });
  }
  return;
}
```
## Handling Recovered Operations
When the primary model fails but a fallback model succeeds, the response will contain both error information and successful response data:
```typescript
const result = await ironaAI.completions.create({
  messages: [{ content: 'What is quantum computing?', role: 'user' }],
  models: ["openai/nonexistent-model", "anthropic/claude-3-opus"],
  fallback_models: ["openai/gpt-4o-mini"]
});
// Even if there's an error property, check if the operation recovered
if ('error' in result) {
  console.warn('Encountered errors:', result.error);
  if (result.recovered && result.response) {
    console.log('Operation recovered using fallback model!');
    console.log('Using:', result.provider + '/' + result.model);
    console.log('Content:', result.response.content);
  } else {
    console.error('Operation failed completely.');
    return;
  }
} else {
  // Regular success case - primary model worked
  console.log('Operation succeeded with primary model');
  console.log('Content:', result.response.content);
}
```
## Error Handling with Streaming Responses
When using streaming, the error handling approach is the same, but response processing differs:
```typescript
const result = await ironaAI.completions.create({
  messages: [{ content: 'Tell me a story', role: 'user' }],
  models: ["openai/gpt-4o-mini"],
  stream: true
});
if ('error' in result) {
  console.error('Streaming error:', result.error);
  return;
}
// Process the stream
console.log(`Streaming from ${result.provider}/${result.model}`);
for await (const chunk of result.response) {
  process.stdout.write(chunk.content || '');
}
```
## Best Practices
1. **Always check for errors**: Use `'error' in result` to check if an error occurred.
2. **Check for recovery**: When handling errors, check if the operation recovered using the `recovered` property.
3. **Use error_trace for debugging**: The error_trace property provides detailed information about all errors encountered.
4. **Configure appropriate fallbacks**: Set fallback models in your configuration to increase resilience.
5. **Set timeouts and retries**: Configure appropriate timeouts and retry counts to balance between reliability and user experience.
