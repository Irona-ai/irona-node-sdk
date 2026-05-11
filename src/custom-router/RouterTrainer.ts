/**
 * Train and manage custom LLM routers that learn which model performs best for different prompts.
 */

import {
  INFER_ENDPOINT,
  MODELS_ENDPOINT,
  TASK_STATUS_ENDPOINT,
  TRAIN_ENDPOINT,
} from '../utils/constants';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { logger } from '../utils/logger';
import { validateApiKey } from '../utils/validateApiKey';

import {
  FitRequestSchema,
  JobStatusResponseSchema,
  type JobStatusResponse,
  ModelDetailsResponseSchema,
  type ModelDetailsResponse,
  PredictRequestSchema,
  PredictionResponseSchema,
  type PredictionResponse,
  TrainingJobResponseSchema,
  type TrainingJobResponse,
} from './schemas';
import type { PredictOptions, RouterTrainerConfig } from './types';

export class RouterTrainer {
  private readonly apiKey: string;
  private modelId?: string;
  private trainingJobId?: string;

  constructor(config: RouterTrainerConfig = {}) {
    const apiKey = config.apiKey ?? process.env.IRONAAI_API_KEY ?? '';
    validateApiKey(apiKey);
    this.apiKey = apiKey;
  }

  /**
   * Start training job with data from URLs (JSONL format).
   */
  public async fit(dataUrls: string[]): Promise<TrainingJobResponse> {
    const payload = FitRequestSchema.parse({ Data_URLs: dataUrls });

    const response = await fetchWithTimeout(TRAIN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Training request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    const result = TrainingJobResponseSchema.parse(data);

    this.trainingJobId = result.training_job_id;
    logger.info(
      `[RouterTrainer] Training job started: ${result.training_job_id}`
    );

    return result;
  }

  /**
   * Check training job status. Auto-updates modelId when completed.
   */
  public async getStatus(jobId?: string): Promise<JobStatusResponse> {
    const targetJobId = jobId ?? this.trainingJobId;

    if (targetJobId === undefined || targetJobId === '') {
      throw new Error(
        'No training job ID found. Call fit() first or provide a job ID.'
      );
    }

    const url = `${TASK_STATUS_ENDPOINT}?task_id=${encodeURIComponent(targetJobId)}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Status check failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    const result = JobStatusResponseSchema.parse(data);

    if (
      result.status === 'completed' &&
      result.model_id !== undefined &&
      result.model_id !== null &&
      (jobId === undefined || jobId === this.trainingJobId)
    ) {
      this.modelId = result.model_id;
      logger.info(
        `[RouterTrainer] Training completed. Model ID: ${result.model_id}`
      );
    }

    return result;
  }

  /**
   * Get trained model metadata and performance metrics.
   */
  public async getModelDetails(
    modelId?: string
  ): Promise<ModelDetailsResponse> {
    const targetModelId = modelId ?? this.modelId;

    if (targetModelId === undefined || targetModelId === '') {
      throw new Error(
        'No model ID found. Wait for training to complete or provide a model ID.'
      );
    }

    const url = `${MODELS_ENDPOINT}?model_id=${encodeURIComponent(targetModelId)}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Model details request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    return ModelDetailsResponseSchema.parse(data);
  }

  /**
   * Run inference to get model recommendations (max 1000 inputs per request).
   */
  public async predict(
    inputs: string[],
    options: PredictOptions = {}
  ): Promise<PredictionResponse> {
    const targetModelId = options.modelId ?? this.modelId;

    if (targetModelId === undefined || targetModelId === '') {
      throw new Error(
        'No model ID found. Wait for training to complete or provide a model ID.'
      );
    }

    const payload = PredictRequestSchema.parse({
      model_id: targetModelId,
      inputs,
      stream: false,
    });

    const response = await fetchWithTimeout(INFER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Prediction request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    return PredictionResponseSchema.parse(data);
  }

  public getModelId(): string | undefined {
    return this.modelId;
  }

  public getTrainingJobId(): string | undefined {
    return this.trainingJobId;
  }

  public setModelId(modelId: string): void {
    this.modelId = modelId;
  }
}
