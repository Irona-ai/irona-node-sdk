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

export const OptimizationStatusResponseSchema = z.object({
  status: z.enum(['in_progress', 'running', 'completed', 'failed']),
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
  status: z.string(),
  results: z.array(OptimizationResultItemSchema),
});
