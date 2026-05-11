import { mockFetch } from '../../mocks/fetch.mock';

import { MissingApiKeyError } from '../../../src/errors';
import { PromptOptimizer } from '../../../src/prompt-optimizer/PromptOptimizer';

describe('PromptOptimizer', () => {
  const validApiKey = 'sk_test_key';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.IRONAAI_API_KEY = validApiKey;
  });

  afterEach(() => {
    delete process.env.IRONAAI_API_KEY;
  });

  // ── Constructor Tests ──────────────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with API key from config', () => {
      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      expect(optimizer).toBeInstanceOf(PromptOptimizer);
    });

    it('initializes with API key from environment', () => {
      process.env.IRONAAI_API_KEY = validApiKey;
      const optimizer = new PromptOptimizer();
      expect(optimizer).toBeInstanceOf(PromptOptimizer);
    });

    it('throws MissingApiKeyError when API key is missing', () => {
      delete process.env.IRONAAI_API_KEY;
      expect(() => new PromptOptimizer()).toThrow(MissingApiKeyError);
      expect(() => new PromptOptimizer()).toThrow('API key is missing');
    });

    it('throws MissingApiKeyError when API key is invalid', () => {
      expect(() => new PromptOptimizer({ apiKey: 'invalid_key' })).toThrow(
        MissingApiKeyError
      );
      expect(() => new PromptOptimizer({ apiKey: 'invalid_key' })).toThrow(
        'invalid'
      );
    });

    it('throws MissingApiKeyError when API key is empty string', () => {
      process.env.IRONAAI_API_KEY = '';
      expect(() => new PromptOptimizer()).toThrow(MissingApiKeyError);
    });
  });

  // ── fit() Tests ────────────────────────────────────────────────────────────

  describe('fit', () => {
    it('successfully starts an optimization job', async () => {
      const mockResponse = { job_id: 'opt_123' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      const result = await optimizer.fit({
        promptUrl: 'https://example.com/prompt.txt',
        datasetUrl: 'https://example.com/dataset.json',
      });

      expect(result).toEqual(mockResponse);
      expect(optimizer.getJobId()).toBe('opt_123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('optimize'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${validApiKey}`,
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            prompt_url: 'https://example.com/prompt.txt',
            dataset_url: 'https://example.com/dataset.json',
          }),
        })
      );
    });

    it('sends all optional parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'opt_456' }),
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        promptUrl: 'https://example.com/prompt.txt',
        datasetUrl: 'https://example.com/dataset.json',
        metric: 'exact_match',
        targetModels: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku'],
        reflectionModel: 'openai/gpt-4o',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: JSON.stringify({
            prompt_url: 'https://example.com/prompt.txt',
            dataset_url: 'https://example.com/dataset.json',
            metric: 'exact_match',
            target_models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku'],
            reflection_model: 'openai/gpt-4o',
          }),
        })
      );
    });

    it('throws error when optimization request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid request',
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });

      await expect(
        optimizer.fit({
          promptUrl: 'https://example.com/prompt.txt',
          datasetUrl: 'https://example.com/dataset.json',
        })
      ).rejects.toThrow('Optimization request failed with status 400');
    });

    it('validates prompt URL format', async () => {
      const optimizer = new PromptOptimizer({ apiKey: validApiKey });

      await expect(
        optimizer.fit({
          promptUrl: 'not-a-url',
          datasetUrl: 'https://example.com/dataset.json',
        })
      ).rejects.toThrow();
    });

    it('validates dataset URL format', async () => {
      const optimizer = new PromptOptimizer({ apiKey: validApiKey });

      await expect(
        optimizer.fit({
          promptUrl: 'https://example.com/prompt.txt',
          datasetUrl: 'not-a-url',
        })
      ).rejects.toThrow();
    });
  });

  // ── getStatus() Tests ──────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('checks status using stored job ID', async () => {
      // First, start an optimization job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'opt_123' }),
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        promptUrl: 'https://example.com/prompt.txt',
        datasetUrl: 'https://example.com/dataset.json',
      });

      // Then check status
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'in_progress' }),
      } as Response);

      const status = await optimizer.getStatus();

      expect(status.status).toBe('in_progress');
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('job_id=opt_123'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${validApiKey}`,
          }),
        })
      );
    });

    it('checks status using explicit job ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'completed' }),
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      const status = await optimizer.getStatus('opt_456');

      expect(status.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('job_id=opt_456'),
        expect.anything()
      );
    });

    it('throws error when no job ID is available', async () => {
      const optimizer = new PromptOptimizer({ apiKey: validApiKey });

      await expect(optimizer.getStatus()).rejects.toThrow('No job ID found');
    });

    it('throws error when status request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Job not found',
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });

      await expect(optimizer.getStatus('invalid_job')).rejects.toThrow(
        'Status check failed with status 404'
      );
    });

    it('handles all status values', async () => {
      const statuses: Array<'in_progress' | 'completed' | 'failed'> = [
        'in_progress',
        'completed',
        'failed',
      ];

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });

      for (const status of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status }),
        } as Response);

        const result = await optimizer.getStatus('opt_test');
        expect(result.status).toBe(status);
      }
    });
  });

  // ── getResults() Tests ─────────────────────────────────────────────────────

  describe('getResults', () => {
    const mockResults = {
      job_id: 'opt_123',
      status: 'completed',
      results: [
        {
          model: ['openai/gpt-4o-mini'],
          optimizer: 'GEPA',
          original_prompt: 'Original prompt text',
          optimized_prompt: 'Optimized prompt text',
          metrics: {
            model: 'openai/gpt-4o-mini',
            winner: 'GEPA',
            avg_score: 0.95,
            optimizer: 'GEPA',
            dev_samples: 100,
            metric_name: 'exact_match',
            eval_samples: 20,
            train_samples: 100,
          },
        },
        {
          model: ['anthropic/claude-3.5-haiku'],
          optimizer: 'GEPA',
          original_prompt: 'Original prompt text',
          optimized_prompt: 'Better optimized prompt text',
          metrics: {
            model: 'anthropic/claude-3.5-haiku',
            winner: 'GEPA',
            avg_score: 0.92,
            optimizer: 'GEPA',
            dev_samples: 100,
            metric_name: 'exact_match',
            eval_samples: 20,
            train_samples: 100,
          },
        },
      ],
    };

    it('gets results using stored job ID', async () => {
      // First, start an optimization job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'opt_123' }),
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        promptUrl: 'https://example.com/prompt.txt',
        datasetUrl: 'https://example.com/dataset.json',
      });

      // Then get results
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      } as Response);

      const results = await optimizer.getResults();

      expect(results).toEqual(mockResults);
      expect(results.results.length).toBe(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('job_id=opt_123'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${validApiKey}`,
          }),
        })
      );
    });

    it('gets results using explicit job ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      const results = await optimizer.getResults('opt_789');

      expect(results.results[0].model).toEqual(['openai/gpt-4o-mini']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('job_id=opt_789'),
        expect.anything()
      );
    });

    it('throws error when no job ID is available', async () => {
      const optimizer = new PromptOptimizer({ apiKey: validApiKey });

      await expect(optimizer.getResults()).rejects.toThrow('No job ID found');
    });

    it('throws error when results request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });

      await expect(optimizer.getResults('opt_123')).rejects.toThrow(
        'Results request failed with status 500'
      );
    });

    it('parses result items with metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      const results = await optimizer.getResults('opt_123');

      expect(results.results[0].metrics.avg_score).toBe(0.95);
      expect(results.results[0].metrics.winner).toBe('GEPA');
      expect(results.results[0].optimizer).toBe('GEPA');
      expect(results.results[0].optimized_prompt).toBe('Optimized prompt text');
    });
  });

  // ── State Management Tests ─────────────────────────────────────────────────

  describe('state management', () => {
    it('tracks job ID after fit()', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'opt_123' }),
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      expect(optimizer.getJobId()).toBeUndefined();

      await optimizer.fit({
        promptUrl: 'https://example.com/prompt.txt',
        datasetUrl: 'https://example.com/dataset.json',
      });

      expect(optimizer.getJobId()).toBe('opt_123');
    });

    it('updates job ID on subsequent fit() calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'opt_first' }),
      } as Response);

      const optimizer = new PromptOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        promptUrl: 'https://example.com/prompt.txt',
        datasetUrl: 'https://example.com/dataset.json',
      });

      expect(optimizer.getJobId()).toBe('opt_first');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'opt_second' }),
      } as Response);

      await optimizer.fit({
        promptUrl: 'https://example.com/prompt2.txt',
        datasetUrl: 'https://example.com/dataset2.json',
      });

      expect(optimizer.getJobId()).toBe('opt_second');
    });
  });
});
