export type OptimizationJobStatus =
  | 'in_progress'
  | 'running'
  | 'completed'
  | 'failed';

export type OptimizationJobResponse = {
  job_id: string;
};

export type OptimizationStatusResponse = {
  status: OptimizationJobStatus;
};

export type OptimizationResultMetrics = {
  model: string;
  winner: string;
  avg_score: number;
  optimizer: string;
  dev_samples: number;
  metric_name: string;
  eval_samples: number;
  train_samples: number;
};

export type OptimizationResultItem = {
  model: string[];
  optimizer: string;
  original_prompt: string;
  optimized_prompt: string;
  metrics: OptimizationResultMetrics;
};

export type OptimizationResultsResponse = {
  job_id: string;
  status: string;
  results: OptimizationResultItem[];
};

export type PromptOptimizerConfig = {
  apiKey?: string;
};

export type FitOptions = {
  promptUrl: string;
  datasetUrl: string;
  metric?: string;
  targetModels?: string[];
  reflectionModel?: string;
};
