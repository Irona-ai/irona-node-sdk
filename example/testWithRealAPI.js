/**
 * Test router behavior with real API
 */

require('dotenv').config();

const { IronlabsAI } = require('../dist/index.js');

async function testSingleModel() {
  console.log('\n========== TEST 1: SINGLE MODEL ==========');
  console.log('Using: openai/gpt-4o-mini\n');

  const IronlabsAI = await IronlabsAI.createInstance({
    apiKey:
      process.env.IRONLABS_AI_API_KEY || 'sk_4E61QXK1N7eKCfTHZ4J-yyGXWWeug7Ji',
  });

  try {
    const result = await IronlabsAI.completions.create({
      messages: [{ content: 'Say hello in 3 words', role: 'user' }],
      models: ['openai/gpt-4o-mini'],
      temperature: 0.5,
      maxTokens: 20,
    });

    console.log('✅ Success!');
    console.log('Provider:', result.provider);
    console.log('Model:', result.model);
    console.log('Response:', result.content);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function testMultipleModels() {
  console.log('\n========== TEST 2: MULTIPLE MODELS ==========');
  console.log('Using: openai/gpt-4o-mini, anthropic/claude-3-haiku-20240307\n');

  const IronlabsAI = await IronlabsAI.createInstance({
    apiKey:
      process.env.IRONLABS_AI_API_KEY || 'sk_4E61QXK1N7eKCfTHZ4J-yyGXWWeug7Ji',
  });

  try {
    const result = await IronlabsAI.completions.create({
      messages: [{ content: 'Say hello in 3 words', role: 'user' }],
      models: ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku-20240307'],
      tradeoff: 'latency',
      temperature: 0.5,
      maxTokens: 20,
    });

    console.log('✅ Success!');
    console.log('Selected Provider:', result.provider);
    console.log('Selected Model:', result.model);
    console.log('Response:', result.content);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function main() {
  console.log('\n🔍 ROUTER BEHAVIOR TEST WITH REAL API\n');
  console.log('Watch for these log messages:');
  console.log('- Single model: "Single model provided, skipping router"');
  console.log(
    '- Multiple models: "Multiple models (N), calling model-select endpoint"'
  );

  await testSingleModel();
  await testMultipleModels();

  console.log('\n========== DONE ==========\n');
}

main().catch(console.error);
