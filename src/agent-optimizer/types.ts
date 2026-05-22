export type AgentOptimizerConfig = {
  apiKey?: string;
};

export type AgentFitOptions = {
  inputUrl: string;
  targetModels: string[];
  nIterations?: number;
  overallTimeoutSeconds?: number;
  llmCallTimeoutSeconds?: number;
  sandboxTimeoutSeconds?: number;
};
