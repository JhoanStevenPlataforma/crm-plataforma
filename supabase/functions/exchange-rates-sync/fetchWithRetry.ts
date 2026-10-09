import type { FetchJson, FetchLike } from "./providers/types.ts";

export type RetryOptions = {
  fetchImpl: FetchLike;
  timeoutMs: number;
  maxAttempts: number;
  /** Injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  /** First backoff; doubled per attempt, with up to 50% jitter. */
  baseDelayMs?: number;
};

export class FxFetchError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = "FxFetchError";
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 429 and 5xx are worth another try; any other status will not change. */
const isRetryableStatus = (status: number) => status === 429 || status >= 500;

/**
 * A JSON GET with a hard timeout and a bounded, backed-off retry. Counts the
 * attempts it used, which the run records, through `attemptsUsed()`.
 */
export const createFetchJson = (options: RetryOptions) => {
  const sleep = options.sleep ?? defaultSleep;
  const baseDelay = options.baseDelayMs ?? 500;
  let attemptsUsed = 0;

  const fetchJson: FetchJson = async (url: string) => {
    let lastError = "no attempt made";

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      attemptsUsed += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      let retryable = true;

      try {
        const response = await options.fetchImpl(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          return await response.json();
        }
        lastError = `HTTP ${response.status} from ${new URL(url).host}`;
        retryable = isRetryableStatus(response.status);
      } catch (error: unknown) {
        lastError = controller.signal.aborted
          ? `timeout after ${options.timeoutMs} ms (${new URL(url).host})`
          : `network error: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        clearTimeout(timer);
      }

      if (!retryable || attempt === options.maxAttempts) {
        break;
      }
      const delay = baseDelay * 2 ** (attempt - 1);
      await sleep(delay + Math.floor(Math.random() * delay * 0.5));
    }

    throw new FxFetchError(lastError, attemptsUsed);
  };

  return { fetchJson, attemptsUsed: () => attemptsUsed };
};
