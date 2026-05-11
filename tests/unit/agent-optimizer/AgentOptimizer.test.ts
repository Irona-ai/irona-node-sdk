import { mockFetch } from '../../mocks/fetch.mock';

import { MissingApiKeyError } from '../../../src/errors';
import { AgentOptimizer } from '../../../src/agent-optimizer/AgentOptimizer';

describe('AgentOptimizer', () => {
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
      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      expect(optimizer).toBeInstanceOf(AgentOptimizer);
    });

    it('initializes with API key from environment', () => {
      process.env.IRONAAI_API_KEY = validApiKey;
      const optimizer = new AgentOptimizer();
      expect(optimizer).toBeInstanceOf(AgentOptimizer);
    });

    it('throws MissingApiKeyError when API key is missing', () => {
      delete process.env.IRONAAI_API_KEY;
      expect(() => new AgentOptimizer()).toThrow(MissingApiKeyError);
      expect(() => new AgentOptimizer()).toThrow('API key is missing');
    });

    it('throws MissingApiKeyError when API key is invalid', () => {
      expect(() => new AgentOptimizer({ apiKey: 'invalid_key' })).toThrow(
        MissingApiKeyError
      );
      expect(() => new AgentOptimizer({ apiKey: 'invalid_key' })).toThrow(
        'invalid'
      );
    });

    it('throws MissingApiKeyError when API key is empty string', () => {
      process.env.IRONAAI_API_KEY = '';
      expect(() => new AgentOptimizer()).toThrow(MissingApiKeyError);
    });
  });

  // ── fit() Tests ────────────────────────────────────────────────────────────

  describe('fit', () => {
    it('successfully starts an optimization job', async () => {
      const mockResponse = { job_id: 'agent_opt_123' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      const result = await optimizer.fit({
        inputUrl: 'https://example.com/agent.zip',
        targetModel: 'openai/gpt-4o-mini',
      });

      expect(result).toEqual(mockResponse);
      expect(optimizer.getJobId()).toBe('agent_opt_123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('optimize'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${validApiKey}`,
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            optimizer: 'agentopt',
            input_url: 'https://example.com/agent.zip',
            target_models: ['openai/gpt-4o-mini'],
          }),
        })
      );
    });

    it('sends all optional parameters when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'agent_opt_456' }),
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        inputUrl: 'https://example.com/agent.zip',
        targetModel: 'openai/gpt-4o-mini',
        nIterations: 20,
        overallTimeoutSeconds: 7200,
        llmCallTimeoutSeconds: 600,
        sandboxTimeoutSeconds: 900,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: JSON.stringify({
            optimizer: 'agentopt',
            input_url: 'https://example.com/agent.zip',
            target_models: ['openai/gpt-4o-mini'],
            n_iterations: 20,
            overall_timeout_seconds: 7200,
            llm_call_timeout_seconds: 600,
            sandbox_timeout_seconds: 900,
          }),
        })
      );
    });

    it('wraps targetModel as single-element array in target_models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'agent_opt_abc' }),
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        inputUrl: 'https://example.com/agent.zip',
        targetModel: 'anthropic/claude-3.5-haiku',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining(
            '"target_models":["anthropic/claude-3.5-haiku"]'
          ),
        })
      );
    });

    it('throws error when optimization request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid request',
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });

      await expect(
        optimizer.fit({
          inputUrl: 'https://example.com/agent.zip',
          targetModel: 'openai/gpt-4o-mini',
        })
      ).rejects.toThrow('Optimization request failed with status 400');
    });

    it('validates input URL format', async () => {
      const optimizer = new AgentOptimizer({ apiKey: validApiKey });

      await expect(
        optimizer.fit({
          inputUrl: 'not-a-url',
          targetModel: 'openai/gpt-4o-mini',
        })
      ).rejects.toThrow();
    });
  });

  // ── getStatus() Tests ──────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('checks status using stored job ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'agent_opt_123' }),
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        inputUrl: 'https://example.com/agent.zip',
        targetModel: 'openai/gpt-4o-mini',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'running' }),
      } as Response);

      const status = await optimizer.getStatus();

      expect(status.status).toBe('running');
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('job_id=agent_opt_123'),
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

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      const status = await optimizer.getStatus('agent_opt_456');

      expect(status.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('job_id=agent_opt_456'),
        expect.anything()
      );
    });

    it('returns extended status fields when present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'running',
          current_iteration: 3,
          best_score: 0.85,
          baseline_score: 0.72,
          n_iterations: 15,
        }),
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      const status = await optimizer.getStatus('agent_opt_123');

      expect(status.current_iteration).toBe(3);
      expect(status.best_score).toBe(0.85);
      expect(status.baseline_score).toBe(0.72);
      expect(status.n_iterations).toBe(15);
    });

    it('throws error when no job ID is available', async () => {
      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      await expect(optimizer.getStatus()).rejects.toThrow('No job ID found');
    });

    it('throws error when status request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Job not found',
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });

      await expect(optimizer.getStatus('invalid_job')).rejects.toThrow(
        'Status check failed with status 404'
      );
    });

    it('handles all valid status values', async () => {
      const statuses: Array<
        'queued' | 'running' | 'completed' | 'failed' | 'interrupted'
      > = ['queued', 'running', 'completed', 'failed', 'interrupted'];

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });

      for (const status of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status }),
        } as Response);

        const result = await optimizer.getStatus('agent_opt_test');
        expect(result.status).toBe(status);
      }
    });
  });

  // ── getResults() Tests ─────────────────────────────────────────────────────

  describe('getResults', () => {
    const mockResults = {
      job_id: 'agent_opt_123',
      status: 'completed',
      results: [
        {
          model: ['openai/gpt-4o-mini'],
          optimizer: 'AGENTOPT',
          original_prompt: 'You are a helpful assistant.',
          optimized_prompt:
            'You are a precise, concise assistant that answers clearly.',
          train_score: 0.88,
          test_score: 0.85,
          iterations_run: 15,
          iterations_kept: 8,
          agent_code_url: 'https://example.com/agent_code.zip',
        },
      ],
    };

    it('gets results using stored job ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'agent_opt_123' }),
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        inputUrl: 'https://example.com/agent.zip',
        targetModel: 'openai/gpt-4o-mini',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      } as Response);

      const results = await optimizer.getResults();

      expect(results).toEqual(mockResults);
      expect(results.results.length).toBe(1);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('job_id=agent_opt_123'),
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

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      const results = await optimizer.getResults('agent_opt_789');

      expect(results.results[0].model).toEqual(['openai/gpt-4o-mini']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('job_id=agent_opt_789'),
        expect.anything()
      );
    });

    it('throws error when no job ID is available', async () => {
      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      await expect(optimizer.getResults()).rejects.toThrow('No job ID found');
    });

    it('throws error when results request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });

      await expect(optimizer.getResults('agent_opt_123')).rejects.toThrow(
        'Results request failed with status 500'
      );
    });

    it('parses result items with numeric scores and agent_code_url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      const results = await optimizer.getResults('agent_opt_123');

      expect(results.results[0].train_score).toBe(0.88);
      expect(results.results[0].test_score).toBe(0.85);
      expect(results.results[0].iterations_run).toBe(15);
      expect(results.results[0].iterations_kept).toBe(8);
      expect(results.results[0].agent_code_url).toBe(
        'https://example.com/agent_code.zip'
      );
      expect(results.results[0].optimizer).toBe('AGENTOPT');
    });
  });

  // ── State Management Tests ─────────────────────────────────────────────────

  describe('state management', () => {
    it('returns undefined job ID before fit()', () => {
      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      expect(optimizer.getJobId()).toBeUndefined();
    });

    it('tracks job ID after fit()', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'agent_opt_123' }),
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        inputUrl: 'https://example.com/agent.zip',
        targetModel: 'openai/gpt-4o-mini',
      });

      expect(optimizer.getJobId()).toBe('agent_opt_123');
    });

    it('updates job ID on subsequent fit() calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'agent_opt_first' }),
      } as Response);

      const optimizer = new AgentOptimizer({ apiKey: validApiKey });
      await optimizer.fit({
        inputUrl: 'https://example.com/agent.zip',
        targetModel: 'openai/gpt-4o-mini',
      });

      expect(optimizer.getJobId()).toBe('agent_opt_first');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'agent_opt_second' }),
      } as Response);

      await optimizer.fit({
        inputUrl: 'https://example.com/agent2.zip',
        targetModel: 'anthropic/claude-3.5-haiku',
      });

      expect(optimizer.getJobId()).toBe('agent_opt_second');
    });
  });
});
