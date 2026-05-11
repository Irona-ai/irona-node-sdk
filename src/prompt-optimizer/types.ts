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
