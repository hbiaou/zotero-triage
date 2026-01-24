/**
 * MemoryMonitor - Track memory usage during plugin operations
 *
 * Used in development mode to detect memory leaks during extended sessions.
 * Logs heap usage growth and warns on unusual spikes.
 */

export class MemoryMonitor {
	private initialHeap: number = 0;
	private maxHeap: number = 0;

	/**
	 * Start monitoring memory usage
	 */
	start(): void {
		const mem = process.memoryUsage();
		this.initialHeap = mem.heapUsed;
		this.maxHeap = mem.heapUsed;
		console.log(`[MemoryMonitor] Started: ${this.formatBytes(mem.heapUsed)}`);
	}

	/**
	 * Check current memory usage and log if growth detected
	 */
	check(label: string): void {
		const mem = process.memoryUsage();
		const current = mem.heapUsed;
		const growth = current - this.maxHeap;

		if (current > this.maxHeap) {
			this.maxHeap = current;
			console.log(`[MemoryMonitor] ${label}: ${this.formatBytes(current)} (growth: ${this.formatBytes(growth)})`);
		}

		// Alert if unusual growth (> 50MB in single operation)
		if (growth > 50 * 1024 * 1024) {
			console.warn(`[MemoryMonitor] Unusual memory growth detected: ${this.formatBytes(growth)}`);
		}
	}

	/**
	 * Get current memory usage summary
	 */
	summary(): string {
		const mem = process.memoryUsage();
		const total = mem.heapTotal;
		const used = mem.heapUsed;
		const growth = used - this.initialHeap;

		return `Total: ${this.formatBytes(total)}, Used: ${this.formatBytes(used)}, Growth: ${this.formatBytes(growth)}`;
	}

	/**
	 * Format bytes as MB
	 */
	private formatBytes(bytes: number): string {
		return (bytes / 1024 / 1024).toFixed(2) + ' MB';
	}
}
