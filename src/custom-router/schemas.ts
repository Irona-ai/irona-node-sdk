import { z } from 'zod';

export const FitRequestSchema = z.object({
  Data_URLs: z.array(z.string().url()).min(1, 'At least one data URL required'),
});

export const PredictRequestSchema = z.object({
  model_id: z.string(),
  inputs: z
    .array(z.string())
    .min(1, 'At least one input required')
    .max(1000, 'Maximum 1000 inputs per request'),
  stream: z.boolean().optional(),
});

export const TrainingJobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
]);

export const TrainingJobResponseSchema = z.object({
  training_job_id: z.string(),
  status: TrainingJobStatusSchema,
});

export const JobStatusResponseSchema = z.object({
  status: TrainingJobStatusSchema,
  model_id: z.string().nullable().optional(),
});

export const ModelDetailsResponseSchema = z.object({
  model_id: z.string(),
  name: z.string().nullable(),
  version: z.string(),
  status: z.string(),
  embedding_model: z.string(),
  num_classes: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  metrics: z.record(z.unknown()).optional(),
});

export const ModelPredictionSchema = z.object({
  model: z.string(),
  confidence: z.number(),
  rank: z.number(),
});

export const PredictionResultSchema = z.object({
  top_model: z.string(),
  top_prob: z.number(),
  models: z.array(ModelPredictionSchema).optional(),
});

export const PredictionResponseSchema = z.object({
  predictions: z.array(PredictionResultSchema),
});

export type FitRequest = z.infer<typeof FitRequestSchema>;
export type PredictRequest = z.infer<typeof PredictRequestSchema>;
export type TrainingJobStatus = z.infer<typeof TrainingJobStatusSchema>;
export type TrainingJobResponse = z.infer<typeof TrainingJobResponseSchema>;
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
export type ModelDetailsResponse = z.infer<typeof ModelDetailsResponseSchema>;
export type ModelPrediction = z.infer<typeof ModelPredictionSchema>;
export type PredictionResult = z.infer<typeof PredictionResultSchema>;
export type PredictionResponse = z.infer<typeof PredictionResponseSchema>;
