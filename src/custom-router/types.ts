export type TrainingJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type TrainingJobResponse = {
  training_job_id: string;
  status: TrainingJobStatus;
};

export type JobStatusResponse = {
  status: TrainingJobStatus;
  model_id?: string | null;
};

export type ModelDetailsResponse = {
  model_id: string;
  name: string | null;
  version: string;
  status: string;
  embedding_model: string;
  num_classes: number;
  created_at: string;
  updated_at: string;
  metrics?: Record<string, unknown>;
};

export type ModelPrediction = {
  model: string;
  confidence: number;
  rank: number;
};

export type PredictionResult = {
  top_model: string;
  top_prob: number;
  models?: ModelPrediction[];
};

export type PredictionResponse = {
  predictions: PredictionResult[];
};

export type RouterTrainerConfig = {
  apiKey?: string;
};

export type PredictOptions = {
  modelId?: string;
  stream?: boolean;
};

export type TrainingData = {
  problems: Array<{
    problem_key: string;
    problem: string;
    correct_models: string[];
  }>;
};
