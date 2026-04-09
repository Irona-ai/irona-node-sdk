export type RouterTrainerConfig = {
  apiKey?: string;
};

export type PredictOptions = {
  modelId?: string;
};

export type TrainingData = {
  problems: Array<{
    problem_key: string;
    problem: string;
    correct_models: string[];
  }>;
};
