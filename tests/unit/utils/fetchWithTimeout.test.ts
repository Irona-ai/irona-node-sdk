import { fetchWithTimeout } from '../../../src/utils/fetchWithTimeout';

describe('fetchWithTimeout', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns response on success within timeout', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await fetchWithTimeout('https://example.com', {}, 5000);

    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws timeout error when request exceeds timeoutMs', async () => {
    mockFetch.mockImplementationOnce((_url: string, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const promise = fetchWithTimeout('https://example.com', {}, 1000);
    jest.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow('timed out after 1000ms');
  });

  it('re-throws external abort (not timeout) without wrapping', async () => {
    const externalController = new AbortController();
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          externalController.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    const promise = fetchWithTimeout(
      'https://example.com',
      { signal: externalController.signal },
      30_000
    );
    externalController.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(promise).rejects.not.toThrow('timed out');
  });

  it('clears timer after successful response (no dangling timers)', async () => {
    const mockResponse = { ok: true } as Response;
    mockFetch.mockResolvedValueOnce(mockResponse);
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    await fetchWithTimeout('https://example.com', {}, 5000);

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('clears timer after fetch throws non-abort error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    await expect(
      fetchWithTimeout('https://example.com', {}, 5000)
    ).rejects.toThrow('Network error');

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('uses default 30s timeout when not specified', async () => {
    const mockResponse = { ok: true } as Response;
    mockFetch.mockResolvedValueOnce(mockResponse);
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    await fetchWithTimeout('https://example.com');

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
  });

  it('re-throws non-abort errors unchanged', async () => {
    const networkErr = new Error('DNS lookup failed');
    mockFetch.mockRejectedValueOnce(networkErr);

    await expect(fetchWithTimeout('https://example.com')).rejects.toThrow(
      'DNS lookup failed'
    );
  });
});
