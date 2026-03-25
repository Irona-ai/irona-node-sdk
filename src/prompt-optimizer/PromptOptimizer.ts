/**
 * Optimize prompts for specific LLM models using Irona's prompt optimization service.
 */

import { MissingApiKeyError } from '../errors';
import {
  IRONAAI_API_KEY_PREFIX,
  OPTIMIZE_ENDPOINT,
  OPTIMIZE_RESULT_ENDPOINT,
  OPTIMIZE_STATUS_ENDPOINT,
} from '../utils/constants';
import { logger } from '../utils/logger';

import {
  FitRequestSchema,
  OptimizationJobResponseSchema,
  OptimizationResultsResponseSchema,
  OptimizationStatusResponseSchema,
} from './schemas';
import type {
  FitOptions,
  OptimizationJobResponse,
  OptimizationResultsResponse,
  OptimizationStatusResponse,
  PromptOptimizerConfig,
} from './types';

export class PromptOptimizer {
  private readonly apiKey: string;
  private jobId?: string;

  constructor(config: PromptOptimizerConfig = {}) {
    const apiKey = config.apiKey ?? process.env.IRONAAI_API_KEY ?? '';

    if (apiKey === '') {
      throw new MissingApiKeyError(
        "The API key is missing. Please provide the API key either through the 'IRONAAI_API_KEY' environment variable or the 'config.apiKey' property."
      );
    }

    if (
      typeof apiKey !== 'string' ||
      !apiKey.startsWith(IRONAAI_API_KEY_PREFIX)
    ) {
      throw new MissingApiKeyError(
        "The provided API key is invalid. Please generate a new key at 'https://app.irona.ai/dashboard/api-keys'."
      );
    }

    this.apiKey = apiKey;
  }

  /**
   * Start a prompt optimization job.
   */
  public async fit(options: FitOptions): Promise<OptimizationJobResponse> {
    const payload = FitRequestSchema.parse({
      prompt_url: options.promptUrl,
      dataset_url: options.datasetUrl,
      metric: options.metric,
      target_models: options.targetModels,
      reflection_model: options.reflectionModel,
    });

    const response = await fetch(OPTIMIZE_ENDPOINT, {
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
        `Optimization request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    const result = OptimizationJobResponseSchema.parse(data);

    this.jobId = result.job_id;
    logger.info(`[PromptOptimizer] Optimization job started: ${result.job_id}`);

    return result;
  }

  /**
   * Check the status of an optimization job.
   */
  public async getStatus(jobId?: string): Promise<OptimizationStatusResponse> {
    const targetJobId = jobId ?? this.jobId;

    if (targetJobId === undefined || targetJobId === '') {
      throw new Error('No job ID found. Call fit() first or provide a job ID.');
    }

    const url = `${OPTIMIZE_STATUS_ENDPOINT}?job_id=${encodeURIComponent(targetJobId)}`;

    const response = await fetch(url, {
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
    const result = OptimizationStatusResponseSchema.parse(data);

    if (result.status === 'completed') {
      logger.info('[PromptOptimizer] Optimization completed.');
    }

    return result;
  }

  /**
   * Get the results of an optimization job.
   */
  public async getResults(
    jobId?: string
  ): Promise<OptimizationResultsResponse> {
    const targetJobId = jobId ?? this.jobId;

    if (targetJobId === undefined || targetJobId === '') {
      throw new Error('No job ID found. Call fit() first or provide a job ID.');
    }

    const url = `${OPTIMIZE_RESULT_ENDPOINT}?job_id=${encodeURIComponent(targetJobId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Results request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    return OptimizationResultsResponseSchema.parse(data);
  }

  public getJobId(): string | undefined {
    return this.jobId;
  }
}
