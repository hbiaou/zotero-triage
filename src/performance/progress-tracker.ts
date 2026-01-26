import { Notice } from 'obsidian';

export interface ProgressState {
	status: string;
	loaded: number;
	total: number;
	percentComplete: number;
}

export class ProgressTracker {
	private notice: Notice | null = null;
	private state: ProgressState;
	private lastUpdateTime: number = 0;
	private cachedMessage: string = '';
	private static readonly UPDATE_THROTTLE_MS = 500;

	constructor() {
		this.state = { status: '', loaded: 0, total: 0, percentComplete: 0 };
	}

	/**
	 * Start tracking progress with persistent Notice (0ms timeout)
	 */
	start(message: string, total: number): void {
		this.state = { status: message, loaded: 0, total, percentComplete: 0 };
		// Persistent notice (0ms = stays until explicitly hidden)
		this.notice = new Notice(this.formatMessage(), 0);
	}

	/**
	 * Update progress state and Notice message
	 * Uses time-based throttling to prevent UI jank during large batch operations
	 */
	update(loaded: number, status?: string): void {
		// Always update internal state
		this.state.loaded = loaded;
		if (status) {
			this.state.status = status;
		}
		this.state.percentComplete = Math.round((loaded / this.state.total) * 100);

		// Throttle DOM updates to UPDATE_THROTTLE_MS intervals
		const now = Date.now();
		if (now - this.lastUpdateTime >= ProgressTracker.UPDATE_THROTTLE_MS) {
			if (this.notice) {
				this.cachedMessage = this.formatMessage();
				this.notice.setMessage(this.cachedMessage);
				this.lastUpdateTime = now;
			}
		}
	}

	/**
	 * Complete operation and hide progress Notice
	 */
	complete(finalMessage?: string): void {
		if (this.notice) {
			this.notice.hide();
			this.notice = null;
		}

		if (finalMessage) {
			// Auto-dismiss success message after 5s (default)
			new Notice(finalMessage);
		}
	}

	/**
	 * Handle error during operation
	 */
	error(message: string): void {
		if (this.notice) {
			this.notice.hide();
			this.notice = null;
		}
		new Notice(message);
	}

	/**
	 * Format progress message with status, bar, and percentage
	 */
	private formatMessage(): string {
		const bar = this.createProgressBar(this.state.percentComplete);
		return `${this.state.status}\n${bar}\n${this.state.loaded}/${this.state.total} (${this.state.percentComplete}%)`;
	}

	/**
	 * Create ASCII progress bar
	 */
	private createProgressBar(percent: number, width: number = 20): string {
		const filled = Math.round((percent / 100) * width);
		const empty = width - filled;
		return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
	}
}
