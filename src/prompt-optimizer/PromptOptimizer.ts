/**
 * Optimize prompts for specific LLM models using Irona's prompt optimization service.
 */

import {
  OPTIMIZE_ENDPOINT,
  OPTIMIZE_RESULT_ENDPOINT,
  OPTIMIZE_STATUS_ENDPOINT,
} from '../utils/constants';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { logger } from '../utils/logger';
import { validateApiKey } from '../utils/validateApiKey';

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
    validateApiKey(apiKey);
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

    const response = await fetchWithTimeout(OPTIMIZE_ENDPOINT, {
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

    const response = await fetchWithTimeout(url, {
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
