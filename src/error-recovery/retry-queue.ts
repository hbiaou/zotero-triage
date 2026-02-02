/**
 * Retry Queue
 *
 * Persistent queue for tracking failed enrichments and scheduling retries.
 * Uses exponential backoff to prevent retry storms: 5min, 15min, 45min, 2hr, 6hr.
 * Queue persists to .zotero-triage-queue.json and survives plugin reloads.
 */

import type { App } from 'obsidian';
import type { QueuedEnrichment } from '../types';

/**
 * Manages persistent retry queue for failed enrichments
 *
 * Features:
 * - Exponential backoff scheduling (5min -> 15min -> 45min -> ...)
 * - Persistent storage to vault root (.zotero-triage-queue.json)
 * - Automatic retry scheduling with getReadyForRetry()
 * - Item lookup by ID or Zotero item ID
 */
export class RetryQueue {
  private queueFilePath = '.zotero-triage-queue.json';
  private queue: Map<string, QueuedEnrichment> = new Map();

  constructor(private app: App) {}

  /**
   * Load queue from disk on plugin initialization
   *
   * Called in plugin onload(). Initializes empty queue if file doesn't exist.
   * Handles JSON parse errors gracefully by starting with empty queue.
   */
  async load(): Promise<void> {
    try {
      const exists = await this.app.vault.adapter.exists(this.queueFilePath);
      if (!exists) {
        this.queue = new Map();
        return;
      }

      const content = await this.app.vault.adapter.read(this.queueFilePath);
      const queueArray: QueuedEnrichment[] = JSON.parse(content);

      this.queue = new Map(queueArray.map(item => [item.id, item]));
    } catch (error) {
      console.error('Failed to load retry queue:', error);
      this.queue = new Map();
    }
  }

  /**
   * Persist queue to disk
   *
   * Called after every queue mutation (enqueue, dequeue, updateRetryAttempt).
   * Writes JSON array to vault root for persistence across plugin reloads.
   */
  async save(): Promise<void> {
    try {
      const queueArray = Array.from(this.queue.values());
      const content = JSON.stringify(queueArray, null, 2);
      await this.app.vault.adapter.write(this.queueFilePath, content);
    } catch (error) {
      console.error('Failed to save retry queue:', error);
    }
  }

  /**
   * Add failed enrichment to retry queue
   *
   * Calculates initial retry time with 5-minute delay.
   * Assigns unique ID based on itemId + timestamp.
   * Persists queue to disk immediately.
   *
   * @param item - Failed enrichment details
   */
  async enqueue(item: {
    itemId: number;
    itemKey: string;
    itemTitle: string;
    notePath: string;
    failureStage: string;
    failureReason: string;
  }): Promise<void> {
    const now = new Date();
    const id = `${item.itemId}-${now.getTime()}`;

    // Calculate next retry time (exponential backoff: 5min, 15min, 45min, 2hr15min, 6hr45min)
    const baseDelay = 5 * 60 * 1000; // 5 minutes in ms
    const attempts = 0; // Initial attempt
    const delay = baseDelay * Math.pow(3, attempts); // Exponential: 5min, 15min, 45min, ...
    const nextRetryTime = new Date(now.getTime() + delay);

    const queued: QueuedEnrichment = {
      id,
      itemId: item.itemId,
      itemKey: item.itemKey,
      itemTitle: item.itemTitle,
      notePath: item.notePath,
      failedAt: now.toISOString(),
      failureStage: item.failureStage,
      failureReason: item.failureReason,
      attempts: 0,
      lastAttemptTime: now.toISOString(),
      nextRetryTime: nextRetryTime.toISOString()
    };

    this.queue.set(id, queued);
    await this.save();
  }

  /**
   * Remove item from retry queue
   *
   * Called when enrichment succeeds or user manually removes item.
   * Persists queue to disk immediately.
   *
   * @param id - Queue entry ID to remove
   */
  async dequeue(id: string): Promise<void> {
    this.queue.delete(id);
    await this.save();
  }

  /**
   * Update retry attempt count and schedule next retry
   *
   * Called after failed retry attempt.
   * Increments attempt counter and recalculates next retry time with exponential backoff.
   * Persists queue to disk immediately.
   *
   * @param id - Queue entry ID to update
   */
  async updateRetryAttempt(id: string): Promise<void> {
    const item = this.queue.get(id);
    if (!item) return;

    const now = new Date();
    item.attempts += 1;
    item.lastAttemptTime = now.toISOString();

    // Calculate next retry with exponential backoff
    const baseDelay = 5 * 60 * 1000; // 5 minutes
    const delay = baseDelay * Math.pow(3, item.attempts);
    const nextRetryTime = new Date(now.getTime() + delay);
    item.nextRetryTime = nextRetryTime.toISOString();

    this.queue.set(id, item);
    await this.save();
  }

  /**
   * Get all queued items
   *
   * Returns snapshot of current queue state.
   * Useful for UI display of pending enrichments.
   *
   * @returns Array of all queued enrichments
   */
  getAll(): QueuedEnrichment[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get items ready for retry (nextRetryTime <= now)
   *
   * Enables batch retry processing.
   * Called periodically to check for items past their retry window.
   *
   * @returns Array of items ready for retry
   */
  getReadyForRetry(): QueuedEnrichment[] {
    const now = new Date();
    return Array.from(this.queue.values()).filter(item => {
      const nextRetry = new Date(item.nextRetryTime);
      return nextRetry <= now;
    });
  }

  /**
   * Get queue size
   *
   * @returns Number of items in queue
   */
  size(): number {
    return this.queue.size;
  }

  /**
   * Clear entire queue (for testing or manual reset)
   *
   * Removes all items from queue and persists empty state to disk.
   * Use with caution - this is irreversible.
   */
  async clear(): Promise<void> {
    this.queue.clear();
    await this.save();
  }

  /**
   * Get item by ID
   *
   * @param id - Queue entry ID
   * @returns Queued enrichment or undefined if not found
   */
  get(id: string): QueuedEnrichment | undefined {
    return this.queue.get(id);
  }

  /**
   * Find queued items by Zotero item ID
   *
   * Useful for checking if item is already queued before re-queueing.
   * Returns all queue entries for the given item (may be multiple if retried).
   *
   * @param itemId - Zotero item ID
   * @returns Array of queued enrichments for this item
   */
  findByItemId(itemId: number): QueuedEnrichment[] {
    return Array.from(this.queue.values()).filter(item => item.itemId === itemId);
  }
}
