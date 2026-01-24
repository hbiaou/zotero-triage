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
	 */
	update(loaded: number, status?: string): void {
		this.state.loaded = loaded;
		if (status) {
			this.state.status = status;
		}
		this.state.percentComplete = Math.round((loaded / this.state.total) * 100);

		if (this.notice) {
			this.notice.setMessage(this.formatMessage());
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
