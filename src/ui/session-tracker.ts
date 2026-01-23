/**
 * SessionTracker - In-memory tracking of triage session progress
 *
 * Tracks items processed during the current session with action counts.
 * Lives in the plugin instance, persisting across view opens/closes.
 */

export interface SessionStats {
  startTime: number;
  itemsProcessed: number;
  itemsAccepted: number;
  itemsRejected: number;
  itemsDeferred: number;
}

export class SessionTracker {
  private stats: SessionStats;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.stats = {
      startTime: Date.now(),
      itemsProcessed: 0,
      itemsAccepted: 0,
      itemsRejected: 0,
      itemsDeferred: 0
    };
  }

  recordAction(action: 'accepted' | 'rejected' | 'deferred'): void {
    this.stats.itemsProcessed++;
    if (action === 'accepted') this.stats.itemsAccepted++;
    if (action === 'rejected') this.stats.itemsRejected++;
    if (action === 'deferred') this.stats.itemsDeferred++;
  }

  undoAction(action: 'accepted' | 'rejected' | 'deferred'): void {
    this.stats.itemsProcessed = Math.max(0, this.stats.itemsProcessed - 1);
    if (action === 'accepted') this.stats.itemsAccepted = Math.max(0, this.stats.itemsAccepted - 1);
    if (action === 'rejected') this.stats.itemsRejected = Math.max(0, this.stats.itemsRejected - 1);
    if (action === 'deferred') this.stats.itemsDeferred = Math.max(0, this.stats.itemsDeferred - 1);
  }

  getStats(): SessionStats {
    return { ...this.stats };
  }

  getSessionDuration(): number {
    return Date.now() - this.stats.startTime;
  }
}
