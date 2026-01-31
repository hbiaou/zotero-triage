/**
 * Resilience Service
 *
 * Implements resilience patterns for AI API calls:
 * - Circuit Breaker: Prevents cascade failures by opening after consecutive failures
 * - Exponential Backoff: Retries with increasing delays
 * - Jitter: Randomizes delays to prevent thundering herd
 * - Retry-After: Respects provider rate limit headers
 */

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	/** Number of consecutive failures before opening circuit (default: 5) */
	failureThreshold: number;
	/** Number of consecutive successes to close from half-open (default: 2) */
	successThreshold: number;
	/** Time in milliseconds before trying half-open (default: 60000) */
	timeout: number;
}

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit Breaker implementation
 *
 * State machine:
 * - closed: Normal operation, requests allowed
 * - open: Too many failures, requests blocked
 * - half-open: Timeout expired, allowing probe requests
 *
 * Transitions:
 * - closed -> open: failureCount >= failureThreshold
 * - open -> half-open: current time > lastFailureTime + timeout
 * - half-open -> closed: successCount >= successThreshold
 * - half-open -> open: any failure
 */
export class CircuitBreaker {
	private state: CircuitBreakerState = 'closed';
	private failureCount: number = 0;
	private successCount: number = 0;
	private lastFailureTime: number = 0;
	private readonly config: CircuitBreakerConfig;

	constructor(config: Partial<CircuitBreakerConfig> = {}) {
		this.config = {
			failureThreshold: config.failureThreshold ?? 5,
			successThreshold: config.successThreshold ?? 2,
			timeout: config.timeout ?? 60000,
		};
	}

	/**
	 * Check if circuit is open (blocking requests)
	 * Also handles auto-transition from open to half-open after timeout
	 */
	isOpen(): boolean {
		if (this.state === 'open') {
			// Check if timeout expired
			const now = Date.now();
			if (now > this.lastFailureTime + this.config.timeout) {
				// Transition to half-open
				this.state = 'half-open';
				this.successCount = 0;
				return false;
			}
			return true;
		}
		return false;
	}

	/**
	 * Check if circuit is in half-open state
	 */
	isHalfOpen(): boolean {
		return this.state === 'half-open';
	}

	/**
	 * Record successful operation
	 * Resets failure count and handles half-open -> closed transition
	 */
	recordSuccess(): void {
		this.failureCount = 0;

		if (this.state === 'half-open') {
			this.successCount++;
			if (this.successCount >= this.config.successThreshold) {
				// Transition to closed
				this.state = 'closed';
				this.successCount = 0;
			}
		}
	}

	/**
	 * Record failed operation
	 * Opens circuit if threshold met, or reopens if in half-open state
	 */
	recordFailure(): void {
		this.failureCount++;
		this.lastFailureTime = Date.now();

		if (this.state === 'half-open') {
			// Any failure in half-open reopens circuit
			this.state = 'open';
			this.successCount = 0;
		} else if (this.failureCount >= this.config.failureThreshold) {
			// Open circuit if threshold met
			this.state = 'open';
		}
	}

	/**
	 * Get current circuit state
	 */
	getState(): CircuitBreakerState {
		return this.state;
	}

	/**
	 * Force reset circuit to closed state
	 * Useful for testing or manual recovery
	 */
	reset(): void {
		this.state = 'closed';
		this.failureCount = 0;
		this.successCount = 0;
		this.lastFailureTime = 0;
	}
}

/**
 * Retry configuration for exponential backoff
 */
export interface RetryConfig {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries: number;
	/** Base delay in milliseconds before first retry (default: 1000) */
	baseDelayMs: number;
	/** Maximum delay in milliseconds (default: 30000) */
	maxDelayMs: number;
	/** Multiplier for exponential backoff (default: 2) */
	backoffMultiplier: number;
	/** Fraction of jitter to add (default: 0.5 = ±50%) */
	jitterFraction: number;
}

/**
 * Default retry logic for determining if error is retryable
 */
function defaultIsRetryable(error: any): boolean {
	const statusCode = error.statusCode || error.status || error.response?.status;

	// Retryable status codes
	if (statusCode === 429) return true; // Rate limit
	if (statusCode >= 500 && statusCode <= 599 && statusCode !== 529) return true; // Server errors (except overloaded)

	// Network errors are retryable
	const message = error.message?.toLowerCase() || '';
	if (
		message.includes('network') ||
		message.includes('timeout') ||
		message.includes('econnrefused') ||
		message.includes('enotfound')
	) {
		return true;
	}

	// Non-retryable errors
	if (statusCode === 401 || statusCode === 403) return false; // Auth errors
	if (statusCode === 400 || statusCode === 404) return false; // Client errors

	// Unknown errors are not retryable by default
	return false;
}

/**
 * Resilience Service
 *
 * Combines circuit breaker pattern with exponential backoff and jitter
 * for resilient AI API calls. Each provider/endpoint gets its own circuit.
 */
export class ResilienceService {
	private circuits: Map<string, CircuitBreaker> = new Map();
	private readonly retryConfig: RetryConfig;
	private readonly circuitConfig: Partial<CircuitBreakerConfig>;

	constructor(
		retryConfig: Partial<RetryConfig> = {},
		circuitConfig: Partial<CircuitBreakerConfig> = {}
	) {
		this.retryConfig = {
			maxRetries: retryConfig.maxRetries ?? 3,
			baseDelayMs: retryConfig.baseDelayMs ?? 1000,
			maxDelayMs: retryConfig.maxDelayMs ?? 30000,
			backoffMultiplier: retryConfig.backoffMultiplier ?? 2,
			jitterFraction: retryConfig.jitterFraction ?? 0.5,
		};
		this.circuitConfig = circuitConfig;
	}

	/**
	 * Execute operation with retry and circuit breaker protection
	 *
	 * @param key - Circuit identifier (e.g., provider ID)
	 * @param operation - Async operation to execute
	 * @param options - Optional retry configuration
	 * @returns Result of successful operation
	 * @throws Error if all retries exhausted or circuit is open
	 */
	async execute<T>(
		key: string,
		operation: () => Promise<T>,
		options: { isRetryable?: (error: any) => boolean } = {}
	): Promise<T> {
		const circuit = this.getOrCreateCircuit(key);
		const isRetryable = options.isRetryable ?? defaultIsRetryable;

		// Check if circuit is open
		if (circuit.isOpen()) {
			throw new Error(
				`Circuit breaker is open for ${key}. Service temporarily unavailable.`
			);
		}

		try {
			// Execute with retry logic
			const result = await this.executeWithRetry(operation, isRetryable);
			circuit.recordSuccess();
			return result;
		} catch (error) {
			circuit.recordFailure();
			throw error;
		}
	}

	/**
	 * Execute operation with exponential backoff retry logic
	 */
	private async executeWithRetry<T>(
		operation: () => Promise<T>,
		isRetryable: (error: any) => boolean
	): Promise<T> {
		let lastError: any;

		for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error;

				// Check if error is retryable
				if (!isRetryable(error)) {
					throw error;
				}

				// Don't retry after last attempt
				if (attempt >= this.retryConfig.maxRetries) {
					break;
				}

				// Calculate delay
				const retryAfter = this.extractRetryAfter(error);
				const delay = retryAfter !== null
					? retryAfter * 1000 // Convert seconds to milliseconds
					: this.calculateBackoff(attempt);

				// Sleep before retry
				await this.sleep(delay);
			}
		}

		// All retries exhausted
		throw lastError;
	}

	/**
	 * Calculate exponential backoff delay with jitter
	 */
	private calculateBackoff(attempt: number): number {
		const exponential =
			this.retryConfig.baseDelayMs *
			Math.pow(this.retryConfig.backoffMultiplier, attempt);
		const capped = Math.min(exponential, this.retryConfig.maxDelayMs);

		// Add jitter: randomize between (1 - jitterFraction/2) and (1 + jitterFraction/2)
		const jitterRange = this.retryConfig.jitterFraction;
		const jitterMin = 1 - jitterRange / 2;
		const jitterMax = 1 + jitterRange / 2;
		const jitterMultiplier = jitterMin + Math.random() * (jitterMax - jitterMin);

		return Math.round(capped * jitterMultiplier);
	}

	/**
	 * Extract retry-after header from error if present
	 * @returns Retry delay in seconds, or null if not found
	 */
	private extractRetryAfter(error: any): number | null {
		const headers = error.headers || error.response?.headers;
		if (!headers) return null;

		const retryAfter = headers['retry-after'] || headers['Retry-After'];
		if (!retryAfter) return null;

		// Parse as integer (seconds)
		const parsed = parseInt(retryAfter, 10);
		return isNaN(parsed) ? null : parsed;
	}

	/**
	 * Get or create circuit breaker for key
	 */
	private getOrCreateCircuit(key: string): CircuitBreaker {
		let circuit = this.circuits.get(key);
		if (!circuit) {
			circuit = new CircuitBreaker(this.circuitConfig);
			this.circuits.set(key, circuit);
		}
		return circuit;
	}

	/**
	 * Get circuit state for monitoring/debugging
	 */
	getCircuitState(key: string): CircuitBreakerState | null {
		const circuit = this.circuits.get(key);
		return circuit ? circuit.getState() : null;
	}

	/**
	 * Force reset circuit to closed state
	 */
	resetCircuit(key: string): void {
		const circuit = this.circuits.get(key);
		if (circuit) {
			circuit.reset();
		}
	}

	/**
	 * Sleep utility for retry delays
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
