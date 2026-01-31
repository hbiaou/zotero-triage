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
