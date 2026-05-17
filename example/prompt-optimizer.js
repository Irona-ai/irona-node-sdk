const { PromptOptimizer } = require('ironaai');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Initializing PromptOptimizer...');
  const optimizer = new PromptOptimizer();

  console.log('\nStarting prompt optimization job...');
  const jobInfo = await optimizer.fit({
    // Replace with publicly accessible URLs
    promptUrl: 'https://your-host.example.com/system-prompt.txt',
    datasetUrl: 'https://your-host.example.com/eval-dataset.json',
    metric: 'exact_match',
    targetModels: ['openai/gpt-4o-mini'],
  });

  console.log(`Optimization job started. Job ID: ${jobInfo.job_id}`);

  console.log('\nWaiting for optimization to complete...');
  let status = 'queued';
  let pollCount = 0;
  const MAX_POLLS = 100; // 100 × 5 min ≈ 8 hours

  while (status !== 'completed' && status !== 'failed' && pollCount < MAX_POLLS) {
    console.log(`Current status: ${status}, waiting 5 minutes...`);
    pollCount++;
    await sleep(300000);

    const statusResponse = await optimizer.getStatus();
    status = statusResponse.status;
  }

  if (pollCount >= MAX_POLLS) {
    console.error(`Polling limit reached (${MAX_POLLS} attempts). Last status: ${status}`);
    process.exit(1);
  }

  if (status === 'failed') {
    console.error('Optimization failed!');
    process.exit(1);
  }

  console.log('\n✓ Optimization completed successfully!');

  console.log('\nFetching optimization results...');
  const results = await optimizer.getResults();

  console.log('\nOptimization Results:');
  for (const result of results.results) {
    console.log(`
Models: ${result.model.join(', ')}
Optimizer: ${result.optimizer}
Avg Score: ${result.metrics.avg_score}
Metric: ${result.metrics.metric_name}
Eval Samples: ${result.metrics.eval_samples}
Original Prompt: ${result.original_prompt.substring(0, 200)}...
Optimized Prompt: ${result.optimized_prompt.substring(0, 200)}...
${'─'.repeat(30)}`);
  }

  console.log('\n✓ All examples completed successfully!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
