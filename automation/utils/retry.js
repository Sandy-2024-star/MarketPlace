// Retry wrapper — runs an async function up to `attempts` times before throwing.
// Use for flaky network operations (page.goto, API calls) on staging.

/**
 * @param {() => Promise<T>} fn        Async action to attempt
 * @param {object} [opts]
 * @param {number} [opts.attempts=2]   Max total attempts (1 = no retry)
 * @param {number} [opts.delayMs=2000] Wait between attempts (ms)
 * @param {string} [opts.label='']     Label for log messages
 * @returns {Promise<T>}
 */
async function withRetry(fn, { attempts = 2, delayMs = 2000, label = '' } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        console.warn(`[retry]${label ? ` ${label}` : ''} attempt ${i} failed — retrying in ${delayMs}ms: ${err.message.split('\n')[0]}`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

module.exports = { withRetry };
