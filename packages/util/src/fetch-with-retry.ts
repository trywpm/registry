export type RetryRequest = {
  readonly url: string;
  readonly init?: RequestInit;
};

export type RetryOptions = {
  readonly retries?: number;
  readonly backoffMs?: readonly number[];
};

const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = [250, 1000, 2000];

export async function fetchWithRetry(
  request: () => RetryRequest | Promise<RetryRequest>,
  opts?: RetryOptions,
): Promise<Response> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const backoff = opts?.backoffMs ?? DEFAULT_BACKOFF_MS;

  let lastError: unknown;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const ms = backoff[Math.min(attempt - 1, backoff.length - 1)];
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    const { url, init } = await request();

    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500) {
        return res;
      }

      lastResponse = res;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastResponse !== undefined) {
    return lastResponse;
  }

  throw lastError ?? new Error('fetchWithRetry: all attempts failed');
}
