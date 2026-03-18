const { RouterTrainer } = require('ironaai');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Initializing RouterTrainer...');
  const trainer = new RouterTrainer();

  console.log('\nStarting training job...');
  const trainingDataUrls = ['https://api.npoint.io/1181b4ec6c6333632b49'];

  const trainingJob = await trainer.fit(trainingDataUrls);
  console.log(`Training job started: ${trainingJob.training_job_id}`);
  console.log(`Initial status: ${trainingJob.status}`);

  console.log('\nMonitoring training progress...');
  let status = trainingJob.status;

  while (status !== 'completed' && status !== 'failed') {
    console.log(`Current status: ${status}, waiting 5 minutes...`);
    await sleep(300000);

    const statusResponse = await trainer.getStatus();
    status = statusResponse.status;

    if (statusResponse.model_id) {
      console.log(`Model ID: ${statusResponse.model_id}`);
    }
  }

  if (status === 'failed') {
    console.error('Training failed!');
    process.exit(1);
  }

  console.log('\n✓ Training completed successfully!');

  console.log('\nFetching model details...');
  const modelDetails = await trainer.getModelDetails();

  console.log(`
Model Information:
  ID: ${modelDetails.model_id}
  Version: ${modelDetails.version}
  Status: ${modelDetails.status}
  Embedding Model: ${modelDetails.embedding_model}
  Number of Classes: ${modelDetails.num_classes}
  Created: ${modelDetails.created_at}
`);

  if (modelDetails.metrics) {
    console.log('\nPerformance Metrics:');
    console.log(JSON.stringify(modelDetails.metrics, null, 2));
  }

  console.log('\nRunning single prediction...');
  const singleInput = [
    'Write a Python function to calculate the factorial of a number',
  ];

  const singlePrediction = await trainer.predict(singleInput);
  const pred = singlePrediction.predictions[0];

  console.log(`
Input: ${singleInput[0]}
Top Model: ${pred.top_model}
Confidence: ${(pred.top_prob * 100).toFixed(2)}%
`);

  if (pred.models && pred.models.length > 0) {
    console.log('Top 3 Recommendations:');
    pred.models.slice(0, 3).forEach((m, i) => {
      console.log(
        `  ${i + 1}. ${m.model} - ${(m.confidence * 100).toFixed(2)}% (rank ${m.rank})`
      );
    });
  }

  console.log('\n\nRunning batch prediction...');
  const batchInputs = [
    'Explain the concept of machine learning',
    'What is the difference between REST and GraphQL?',
    'How do I implement binary search in JavaScript?',
    'Describe the SOLID principles in software engineering',
  ];

  const batchPredictions = await trainer.predict(batchInputs);

  console.log('\nBatch Results:');
  batchPredictions.predictions.forEach((prediction, i) => {
    console.log(`\n${i + 1}. Input: ${batchInputs[i].substring(0, 50)}...`);
    console.log(
      `   Best Model: ${prediction.top_model} (${(prediction.top_prob * 100).toFixed(2)}%)`
    );

    if (prediction.models && prediction.models.length > 1) {
      const alternatives = prediction.models
        .slice(1, 3)
        .map(m => m.model)
        .join(', ');
      console.log(`   Alternatives: ${alternatives}`);
    }
  });

  console.log('\n\nDemo: Processing large dataset with batching...');

  const largeDataset = Array.from(
    { length: 1200 },
    (_, i) => `Test query ${i + 1}`
  );
  const BATCH_SIZE = 500;

  console.log(`Total inputs: ${largeDataset.length}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  const allPredictions = [];
  for (let i = 0; i < largeDataset.length; i += BATCH_SIZE) {
    const batch = largeDataset.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(largeDataset.length / BATCH_SIZE)}...`
    );

    const result = await trainer.predict(batch);
    allPredictions.push(...result.predictions);

    console.log(
      `  Processed ${Math.min(i + BATCH_SIZE, largeDataset.length)}/${largeDataset.length} inputs`
    );
  }

  console.log(
    `\n✓ Batch processing complete! Total predictions: ${allPredictions.length}`
  );

  console.log('\n\nDemo: Loading a previously trained model...');

  const newTrainer = new RouterTrainer();
  newTrainer.setModelId(modelDetails.model_id);

  const testPrediction = await newTrainer.predict([
    'What is the time complexity of quicksort?',
  ]);
  console.log('Successfully loaded and used existing model!');
  console.log(`Recommended model: ${testPrediction.predictions[0].top_model}`);

  console.log('\n✓ All examples completed successfully!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
