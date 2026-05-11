import type { ZodSchema } from 'zod';

import {
  OPTIMIZE_ENDPOINT,
  OPTIMIZE_RESULT_ENDPOINT,
  OPTIMIZE_STATUS_ENDPOINT,
} from '../utils/constants';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { logger } from '../utils/logger';
import { validateApiKey } from '../utils/validateApiKey';

import {
  AgentFitRequestSchema,
  AgentOptimizationJobResponseSchema,
  AgentOptimizationResultsResponseSchema,
  AgentOptimizationStatusResponseSchema,
  type AgentOptimizationJobResponse,
  type AgentOptimizationResultsResponse,
  type AgentOptimizationStatusResponse,
} from './schemas';
import type { AgentOptimizerConfig, FitOptions } from './types';

export class AgentOptimizer {
  private readonly apiKey: string;
  private jobId?: string;

  constructor(config: AgentOptimizerConfig = {}) {
    const apiKey = config.apiKey ?? process.env.IRONAAI_API_KEY ?? '';
    validateApiKey(apiKey);
    this.apiKey = apiKey;
  }

  public async fit(options: FitOptions): Promise<AgentOptimizationJobResponse> {
    const payload = AgentFitRequestSchema.parse({
      optimizer: 'agentopt',
      input_url: options.inputUrl,
      target_models: [options.targetModel],
      n_iterations: options.nIterations,
      overall_timeout_seconds: options.overallTimeoutSeconds,
      llm_call_timeout_seconds: options.llmCallTimeoutSeconds,
      sandbox_timeout_seconds: options.sandboxTimeoutSeconds,
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
    const result = AgentOptimizationJobResponseSchema.parse(data);

    this.jobId = result.job_id;
    logger.info(`[AgentOptimizer] Optimization job started: ${result.job_id}`);

    return result;
  }

  public async getStatus(
    jobId?: string
  ): Promise<AgentOptimizationStatusResponse> {
    const targetJobId = this.resolveJobId(jobId);
    const url = `${OPTIMIZE_STATUS_ENDPOINT}?job_id=${encodeURIComponent(targetJobId)}`;
    const result = await this.makeGetRequest(
      url,
      AgentOptimizationStatusResponseSchema,
      'Status check'
    );

    if (result.status === 'completed') {
      logger.info('[AgentOptimizer] Optimization completed.');
    }

    return result;
  }

  public async getResults(
    jobId?: string
  ): Promise<AgentOptimizationResultsResponse> {
    const targetJobId = this.resolveJobId(jobId);
    const url = `${OPTIMIZE_RESULT_ENDPOINT}?job_id=${encodeURIComponent(targetJobId)}`;
    return this.makeGetRequest(
      url,
      AgentOptimizationResultsResponseSchema,
      'Results request'
    );
  }

  public getJobId(): string | undefined {
    return this.jobId;
  }

  private resolveJobId(jobId?: string): string {
    const targetJobId = jobId ?? this.jobId;
    if (targetJobId === undefined || targetJobId === '') {
      throw new Error('No job ID found. Call fit() first or provide a job ID.');
    }
    return targetJobId;
  }

  private async makeGetRequest<T>(
    url: string,
    schema: ZodSchema<T>,
    errorLabel: string
  ): Promise<T> {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `${errorLabel} failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    return schema.parse(data);
  }
}
