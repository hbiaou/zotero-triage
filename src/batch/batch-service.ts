/**
 * BatchService - Generates batches of items for triage workflow
 *
 * Handles:
 * - Generating batches of N items based on registry state
 * - Prioritizing recent items (sorted by dateAdded descending)
 * - Optionally including deferred items when insufficient unprocessed items
 * - Marking selected items as 'proposed' in registry
 */

import type { ZoteroConnector } from '../db/zotero-connector';
import type { RegistryService } from '../registry/registry-service';
import type { BatchOptions, Batch } from './types';
import type { ZoteroItem } from '../types';

/**
 * BatchService manages batch generation for the triage workflow
 */
export class BatchService {
  private connector: ZoteroConnector;
  private registry: RegistryService;

  /**
   * Create a new BatchService
   * @param connector - ZoteroConnector instance for accessing items
   * @param registry - RegistryService instance for state tracking
   */
  constructor(connector: ZoteroConnector, registry: RegistryService) {
    this.connector = connector;
    this.registry = registry;
  }

  /**
   * Generate a batch of items for triage
   *
   * Algorithm:
   * 1. Get all items from connector cache
   * 2. Filter out imported and rejected items
   * 3. If includeDeferred is false, also filter out deferred items
   * 4. Sort by dateAdded descending (most recent first)
   * 5. Take N items based on options.size
   * 6. Mark selected items as 'proposed' in registry
   *
   * @param options - Batch generation options
   * @returns Generated batch with items and metadata
   */
  async generateBatch(options: BatchOptions): Promise<Batch> {
    // Get all items from connector cache
    const allItems = this.connector.getCachedItems();

    // Filter items based on registry state
    const availableItems = allItems.filter(item => {
      const state = this.registry.getState(item.itemID);

      // Always exclude imported and rejected items
      if (state === 'imported' || state === 'rejected') {
        return false;
      }

      // Optionally exclude deferred items
      if (!options.includeDeferred && state === 'deferred') {
        return false;
      }

      return true;
    });

    // Sort by dateAdded descending (most recent first)
    availableItems.sort((a, b) => {
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });

    // Take N items
    const selectedItems = availableItems.slice(0, options.size);

    // Check if any deferred items were included
    const includesDeferred = selectedItems.some(item => {
      return this.registry.getState(item.itemID) === 'deferred';
    });

    // Mark selected items as 'proposed' in registry
    for (const item of selectedItems) {
      this.registry.markState(item.itemID, 'proposed');
    }

    return {
      items: selectedItems,
      generatedAt: Date.now(),
      includesDeferred
    };
  }

  /**
   * Get count of unprocessed items (state = 'unseen')
   * @returns Number of items that haven't been seen yet
   */
  getUnprocessedCount(): number {
    const allItems = this.connector.getCachedItems();
    return allItems.filter(item => {
      return this.registry.getState(item.itemID) === 'unseen';
    }).length;
  }

  /**
   * Get count of deferred items (state = 'deferred')
   * @returns Number of items that have been deferred
   */
  getDeferredCount(): number {
    const allItems = this.connector.getCachedItems();
    return allItems.filter(item => {
      return this.registry.getState(item.itemID) === 'deferred';
    }).length;
  }

  /**
   * Check if there are enough unprocessed items for a batch
   * @param size - Desired batch size
   * @returns true if enough unprocessed items exist
   */
  hasEnoughItems(size: number): boolean {
    return this.getUnprocessedCount() >= size;
  }
}
