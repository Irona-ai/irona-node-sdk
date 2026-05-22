import { z } from 'zod';

export const AgentFitRequestSchema = z.object({
  optimizer: z.literal('agentopt'),
  input_url: z.string().url('A valid input URL is required'),
  target_models: z.array(z.string()).min(1),
  n_iterations: z.number().int().positive().optional(),
  overall_timeout_seconds: z.number().int().positive().optional(),
  llm_call_timeout_seconds: z.number().int().positive().optional(),
  sandbox_timeout_seconds: z.number().int().positive().optional(),
});

export const AgentOptimizationJobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'partial',
  'failed',
  'interrupted',
]);

export const AgentOptimizationJobResponseSchema = z.object({
  job_id: z.string(),
  status: AgentOptimizationJobStatusSchema.optional(),
  version: z.string().optional(),
});

export const AgentOptimizationModelResultSchema = z.object({
  model: z.string(),
  status: z.string(),
  current_iteration: z.number().optional(),
  best_score: z.number().optional(),
  baseline_score: z.number().optional(),
});

export const AgentOptimizationStatusResponseSchema = z.object({
  status: AgentOptimizationJobStatusSchema,
  n_iterations: z.number().optional(),
  model_results: z.array(AgentOptimizationModelResultSchema).optional(),
});

export const AgentOptimizationResultItemSchema = z.object({
  model: z.array(z.string()),
  optimizer: z.string(),
  original_prompt: z.string().nullable().optional(),
  optimized_prompt: z.string().nullable().optional(),
  train_score: z.number(),
  test_score: z.number(),
  iterations_run: z.number(),
  iterations_kept: z.number(),
  agent_code: z.string().nullable().optional(),
  cost_breakdown: z.record(z.unknown()).nullable().optional(),
  token_breakdown: z.record(z.unknown()).nullable().optional(),
});

export const AgentOptimizationResultsResponseSchema = z.object({
  job_id: z.string(),
  status: z.string(),
  results: z.array(AgentOptimizationResultItemSchema),
});

export type AgentOptimizationJobStatus = z.infer<
  typeof AgentOptimizationJobStatusSchema
>;
export type AgentOptimizationJobResponse = z.infer<
  typeof AgentOptimizationJobResponseSchema
>;
export type AgentOptimizationModelResult = z.infer<
  typeof AgentOptimizationModelResultSchema
>;
export type AgentOptimizationStatusResponse = z.infer<
  typeof AgentOptimizationStatusResponseSchema
>;
export type AgentOptimizationResultItem = z.infer<
  typeof AgentOptimizationResultItemSchema
>;
export type AgentOptimizationResultsResponse = z.infer<
  typeof AgentOptimizationResultsResponseSchema
>;
