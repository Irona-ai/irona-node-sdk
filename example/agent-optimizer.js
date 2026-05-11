const { AgentOptimizer } = require('ironaai');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const optimizer = new AgentOptimizer();

  const jobInfo = await optimizer.fit({
    // ZIP must contain: agent.py (with EDITABLE/FIXED markers), eval.py, dataset.json
    inputUrl: 'https://your-host.example.com/agent-bundle.zip',
    targetModel: 'target-model-name',
    nIterations: 20,
  });

  console.log(`Job started: ${jobInfo.job_id}`);

  let status = 'queued';
  while (
    status !== 'completed' &&
    status !== 'failed' &&
    status !== 'interrupted'
  ) {
    await sleep(300000); // poll every 5 min

    const statusResponse = await optimizer.getStatus();
    status = statusResponse.status;

    const iter = statusResponse.current_iteration;
    const total = statusResponse.n_iterations;
    const best = statusResponse.best_score;
    console.log(
      `Status: ${status} | iteration: ${iter ?? '-'}/${total ?? '-'} | best: ${best ?? '-'}`
    );
  }

  if (status !== 'completed') {
    console.error(`Ended with status: ${status}`);
    process.exit(1);
  }

  const results = await optimizer.getResults();
  for (const r of results.results) {
    console.log(`Model: ${r.model}`);
    console.log(`Train: ${r.train_score} | Test: ${r.test_score}`);
    console.log(`Iterations: ${r.iterations_kept}/${r.iterations_run} kept`);
    console.log(`Agent code: ${r.agent_code_url}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
