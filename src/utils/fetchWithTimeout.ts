export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  let timeoutTriggered = false;
  const timer = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, timeoutMs);
  timer.unref();

  const signal =
    init?.signal != null
      ? typeof AbortSignal.any === 'function'
        ? AbortSignal.any([init.signal, controller.signal])
        : (() => {
            const composed = new AbortController();
            if (init.signal?.aborted === true || controller.signal.aborted) {
              composed.abort();
            }
            const abort = () => composed.abort();
            init.signal?.addEventListener('abort', abort, { once: true });
            controller.signal.addEventListener('abort', abort, { once: true });
            return composed.signal;
          })()
      : controller.signal;

  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      if (timeoutTriggered) {
        throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
