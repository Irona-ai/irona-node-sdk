export type AgentOptimizerConfig = {
  apiKey?: string;
};

export type FitOptions = {
  inputUrl: string;
  targetModel: string;
  nIterations?: number;
  overallTimeoutSeconds?: number;
  llmCallTimeoutSeconds?: number;
  sandboxTimeoutSeconds?: number;
};
