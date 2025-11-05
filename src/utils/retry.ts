export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, error: unknown) => void;
  wait?: (delay: number) => Promise<void>;
}

const defaultWait = (delay: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delay));

export async function retryWithBackoff<T>(
  task: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 2,
    baseDelayMs = 300,
    maxDelayMs = 3000,
    jitter = true,
    onRetry,
    wait = defaultWait,
  } = options;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitterValue = jitter ? Math.floor(Math.random() * (delay / 2)) : 0;
      onRetry?.(attempt + 1, error);
      await wait(delay + jitterValue);
      attempt += 1;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("retry_failed_without_error_instance");
}
