export interface RetryOptions {
	maxAttempts: number;       // Default: 5
	initialDelayMs: number;    // Default: 100ms
	maxDelayMs: number;        // Default: 5000ms
	backoffMultiplier: number; // Default: 2
}

/**
 * Retry async operation with exponential backoff
 * Handles SQLITE_BUSY errors specifically
 */
export async function retryWithBackoff<T>(
	operation: () => Promise<T>,
	options: Partial<RetryOptions> = {}
): Promise<T> {
	const config: RetryOptions = {
		maxAttempts: options.maxAttempts ?? 5,
		initialDelayMs: options.initialDelayMs ?? 100,
		maxDelayMs: options.maxDelayMs ?? 5000,
		backoffMultiplier: options.backoffMultiplier ?? 2
	};

	let lastError: Error | null = null;

	for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
		try {
			return await operation();
		} catch (err) {
			lastError = err as Error;

			// Check if error is retryable (SQLITE_BUSY)
			if (!isSqliteBusy(lastError)) {
				// Non-retryable error; fail immediately
				throw err;
			}

			// Don't retry after last attempt
			if (attempt >= config.maxAttempts - 1) {
				break;
			}

			// Calculate delay with exponential backoff
			const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
			const cappedDelay = Math.min(baseDelay, config.maxDelayMs);

			// Add jitter (0-50ms) to prevent thundering herd
			const jitter = Math.random() * 50;
			const totalDelay = cappedDelay + jitter;

			console.log(`[RetryHandler] Attempt ${attempt + 1}/${config.maxAttempts} failed with SQLITE_BUSY. Retrying in ${totalDelay.toFixed(0)}ms...`);

			await sleep(totalDelay);
		}
	}

	// All retries exhausted
	throw lastError ?? new Error('Operation failed after retries');
}

/**
 * Check if error is SQLITE_BUSY (database locked)
 */
export function isSqliteBusy(error: Error): boolean {
	const message = error.message.toLowerCase();
	return message.includes('sqlite_busy') ||
		message.includes('database is locked') ||
		message.includes('database locked');
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
