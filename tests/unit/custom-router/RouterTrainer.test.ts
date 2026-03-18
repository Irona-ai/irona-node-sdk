import { MissingApiKeyError } from '../../../src/errors';
import { RouterTrainer } from '../../../src/custom-router/RouterTrainer';

// Mock fetch globally
global.fetch = jest.fn();

describe('RouterTrainer', () => {
  const validApiKey = 'sk_test_key';
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

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
      const trainer = new RouterTrainer({ apiKey: validApiKey });
      expect(trainer).toBeInstanceOf(RouterTrainer);
    });

    it('initializes with API key from environment', () => {
      process.env.IRONAAI_API_KEY = validApiKey;
      const trainer = new RouterTrainer();
      expect(trainer).toBeInstanceOf(RouterTrainer);
    });

    it('throws MissingApiKeyError when API key is missing', () => {
      delete process.env.IRONAAI_API_KEY;
      expect(() => new RouterTrainer()).toThrow(MissingApiKeyError);
      expect(() => new RouterTrainer()).toThrow('API key is missing');
    });

    it('throws MissingApiKeyError when API key is invalid', () => {
      expect(() => new RouterTrainer({ apiKey: 'invalid_key' })).toThrow(
        MissingApiKeyError
      );
      expect(() => new RouterTrainer({ apiKey: 'invalid_key' })).toThrow(
        'invalid'
      );
    });

    it('throws MissingApiKeyError when API key is empty string', () => {
      process.env.IRONAAI_API_KEY = '';
      expect(() => new RouterTrainer()).toThrow(MissingApiKeyError);
    });
  });

  // ── fit() Tests ────────────────────────────────────────────────────────────

  describe('fit', () => {
    it('successfully starts a training job', async () => {
      const mockResponse = {
        training_job_id: 'job_123',
        status: 'queued',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      const result = await trainer.fit(['https://example.com/data.jsonl']);

      expect(result).toEqual(mockResponse);
      expect(trainer.getTrainingJobId()).toBe('job_123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('train'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${validApiKey}`,
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            Data_URLs: ['https://example.com/data.jsonl'],
          }),
        })
      );
    });

    it('accepts multiple data URLs', async () => {
      const mockResponse = {
        training_job_id: 'job_456',
        status: 'queued',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      const dataUrls = [
        'https://example.com/data1.jsonl',
        'https://example.com/data2.jsonl',
      ];
      const result = await trainer.fit(dataUrls);

      expect(result.training_job_id).toBe('job_456');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: JSON.stringify({ Data_URLs: dataUrls }),
        })
      );
    });

    it('throws error when training request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid training data',
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });

      await expect(
        trainer.fit(['https://example.com/data.jsonl'])
      ).rejects.toThrow('Training request failed with status 400');
    });

    it('validates data URLs format', async () => {
      const trainer = new RouterTrainer({ apiKey: validApiKey });

      await expect(trainer.fit(['not-a-url'])).rejects.toThrow();
    });

    it('requires at least one data URL', async () => {
      const trainer = new RouterTrainer({ apiKey: validApiKey });

      await expect(trainer.fit([])).rejects.toThrow();
    });
  });

  // ── getStatus() Tests ──────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('checks status using stored job ID', async () => {
      // First, start a training job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ training_job_id: 'job_123', status: 'queued' }),
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      await trainer.fit(['https://example.com/data.jsonl']);

      // Then check status
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'running' }),
      } as Response);

      const status = await trainer.getStatus();

      expect(status.status).toBe('running');
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('task_id=job_123'),
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
        json: async () => ({ status: 'completed', model_id: 'model_789' }),
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      const status = await trainer.getStatus('job_456');

      expect(status.status).toBe('completed');
      expect(status.model_id).toBe('model_789');
    });

    it('auto-updates model ID when training completes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'completed', model_id: 'model_789' }),
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      await trainer.getStatus('job_456');

      expect(trainer.getModelId()).toBe('model_789');
    });

    it('throws error when no job ID is available', async () => {
      const trainer = new RouterTrainer({ apiKey: validApiKey });

      await expect(trainer.getStatus()).rejects.toThrow(
        'No training job ID found'
      );
    });

    it('throws error when status request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Job not found',
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });

      await expect(trainer.getStatus('invalid_job')).rejects.toThrow(
        'Status check failed with status 404'
      );
    });

    it('handles all status values', async () => {
      const statuses: Array<'queued' | 'running' | 'completed' | 'failed'> = [
        'queued',
        'running',
        'completed',
        'failed',
      ];

      const trainer = new RouterTrainer({ apiKey: validApiKey });

      for (const status of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status }),
        } as Response);

        const result = await trainer.getStatus('job_test');
        expect(result.status).toBe(status);
      }
    });
  });

  // ── getModelDetails() Tests ────────────────────────────────────────────────

  describe('getModelDetails', () => {
    const mockModelDetails = {
      model_id: 'model_789',
      name: null,
      version: 'v1.0',
      status: 'active',
      embedding_model: 'Qwen/Qwen3-Embedding-4B',
      num_classes: 11,
      created_at: '2026-03-16T09:46:04.788000',
      updated_at: '2026-03-16T09:46:04.788000',
      metrics: {
        top1_hit_rate: 0.8317,
      },
    };

    it('gets model details using stored model ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockModelDetails,
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      const details = await trainer.getModelDetails();

      expect(details).toEqual(mockModelDetails);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('model_id=model_789'),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('gets model details using explicit model ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockModelDetails,
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      const details = await trainer.getModelDetails('model_custom');

      expect(details.model_id).toBe('model_789');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('model_id=model_custom'),
        expect.anything()
      );
    });

    it('throws error when no model ID is available', async () => {
      const trainer = new RouterTrainer({ apiKey: validApiKey });

      await expect(trainer.getModelDetails()).rejects.toThrow(
        'No model ID found'
      );
    });

    it('throws error when model details request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Model not found',
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('invalid_model');

      await expect(trainer.getModelDetails()).rejects.toThrow(
        'Model details request failed with status 404'
      );
    });

    it('parses model details with optional metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockModelDetails,
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      const details = await trainer.getModelDetails();

      expect(details.model_id).toBe('model_789');
      expect(details.num_classes).toBe(11);
      expect(details.metrics).toBeDefined();
    });
  });

  // ── predict() Tests ────────────────────────────────────────────────────────

  describe('predict', () => {
    it('runs single-label prediction', async () => {
      const mockPrediction = {
        predictions: [
          {
            top_model: 'gpt-4o-mini',
            top_prob: 0.87,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrediction,
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      const result = await trainer.predict(['What is Python?']);

      expect(result).toEqual(mockPrediction);
      expect(result.predictions[0].top_model).toBe('gpt-4o-mini');
      expect(result.predictions[0].top_prob).toBe(0.87);
    });

    it('runs multi-label prediction with model rankings', async () => {
      const mockPrediction = {
        predictions: [
          {
            top_model: 'gpt-4o-mini',
            top_prob: 0.87,
            models: [
              { model: 'gpt-4o-mini', confidence: 0.87, rank: 1 },
              { model: 'claude-3-haiku', confidence: 0.85, rank: 2 },
              { model: 'gemini-2.5-flash', confidence: 0.82, rank: 3 },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrediction,
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      const result = await trainer.predict(['Explain binary search']);

      expect(result.predictions[0].models).toBeDefined();
      expect(result.predictions[0].models?.length).toBe(3);
      expect(result.predictions[0].models?.[0].model).toBe('gpt-4o-mini');
    });

    it('handles batch predictions', async () => {
      const mockPrediction = {
        predictions: [
          { top_model: 'gpt-4o-mini', top_prob: 0.87 },
          { top_model: 'claude-3-haiku', top_prob: 0.92 },
          { top_model: 'gemini-2.5-flash', top_prob: 0.85 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrediction,
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      const inputs = [
        'What is Python?',
        'How to use API?',
        'Explain quantum computing',
      ];
      const result = await trainer.predict(inputs);

      expect(result.predictions.length).toBe(3);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: JSON.stringify({
            model_id: 'model_789',
            inputs,
            stream: false,
          }),
        })
      );
    });

    it('uses explicit model ID when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ predictions: [] }),
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_default');

      await trainer.predict(['test'], { modelId: 'model_custom' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('model_custom'),
        })
      );
    });

    it('throws error when no model ID is available', async () => {
      const trainer = new RouterTrainer({ apiKey: validApiKey });

      await expect(trainer.predict(['test'])).rejects.toThrow(
        'No model ID found'
      );
    });

    it('throws error when prediction request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      await expect(trainer.predict(['test'])).rejects.toThrow(
        'Prediction request failed with status 500'
      );
    });

    it('validates input array is not empty', async () => {
      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      await expect(trainer.predict([])).rejects.toThrow();
    });

    it('validates max 1000 inputs per request', async () => {
      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      const tooManyInputs = Array.from({ length: 1001 }, (_, i) => `test ${i}`);

      await expect(trainer.predict(tooManyInputs)).rejects.toThrow();
    });

    it('supports stream option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ predictions: [] }),
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      trainer.setModelId('model_789');

      await trainer.predict(['test'], { stream: true });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('"stream":true'),
        })
      );
    });
  });

  // ── State Management Tests ─────────────────────────────────────────────────

  describe('state management', () => {
    it('tracks training job ID after fit()', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ training_job_id: 'job_123', status: 'queued' }),
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      expect(trainer.getTrainingJobId()).toBeUndefined();

      await trainer.fit(['https://example.com/data.jsonl']);

      expect(trainer.getTrainingJobId()).toBe('job_123');
    });

    it('tracks model ID after training completes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'completed', model_id: 'model_789' }),
      } as Response);

      const trainer = new RouterTrainer({ apiKey: validApiKey });
      expect(trainer.getModelId()).toBeUndefined();

      await trainer.getStatus('job_123');

      expect(trainer.getModelId()).toBe('model_789');
    });

    it('allows manual model ID setting', () => {
      const trainer = new RouterTrainer({ apiKey: validApiKey });

      trainer.setModelId('manual_model_id');

      expect(trainer.getModelId()).toBe('manual_model_id');
    });
  });
});
