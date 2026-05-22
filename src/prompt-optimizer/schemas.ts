import { z } from 'zod';

export const FitRequestSchema = z.object({
  prompt_url: z.string().url('A valid prompt URL is required'),
  dataset_url: z.string().url('A valid dataset URL is required'),
  metric: z.string().optional(),
  target_models: z.array(z.string()).optional(),
  reflection_model: z.string().optional(),
});

export const OptimizationJobResponseSchema = z.object({
  job_id: z.string(),
});

export const OptimizationJobStatusSchema = z.enum([
  'queued',
  'in_progress',
  'running',
  'completed',
  'failed',
]);

export const OptimizationStatusResponseSchema = z.object({
  status: OptimizationJobStatusSchema,
});

export const OptimizationResultMetricsSchema = z.object({
  model: z.string(),
  winner: z.string(),
  avg_score: z.number(),
  optimizer: z.string(),
  dev_samples: z.number(),
  metric_name: z.string(),
  eval_samples: z.number(),
  train_samples: z.number(),
});

export const OptimizationResultItemSchema = z.object({
  model: z.array(z.string()),
  optimizer: z.string(),
  original_prompt: z.string(),
  optimized_prompt: z.string(),
  metrics: OptimizationResultMetricsSchema,
});

export const OptimizationResultsResponseSchema = z.object({
  job_id: z.string(),
  status: OptimizationJobStatusSchema,
  results: z.array(OptimizationResultItemSchema),
});

export type OptimizationJobStatus = z.infer<typeof OptimizationJobStatusSchema>;
export type OptimizationJobResponse = z.infer<
  typeof OptimizationJobResponseSchema
>;
export type OptimizationStatusResponse = z.infer<
  typeof OptimizationStatusResponseSchema
>;
export type OptimizationResultMetrics = z.infer<
  typeof OptimizationResultMetricsSchema
>;
export type OptimizationResultItem = z.infer<
  typeof OptimizationResultItemSchema
>;
export type OptimizationResultsResponse = z.infer<
  typeof OptimizationResultsResponseSchema
>;
