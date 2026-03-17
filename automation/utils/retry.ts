// Retry wrapper — runs an async function up to `attempts` times before throwing.
// Use for flaky network operations (page.goto, API calls) on staging.

interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 2, delayMs = 2000, label = '' }: RetryOptions = {}
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
        console.warn(`[retry]${label ? ` ${label}` : ''} attempt ${i} failed — retrying in ${delayMs}ms: ${msg}`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}
