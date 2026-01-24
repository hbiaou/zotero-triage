/**
 * BatchService - Generates batches of items for triage workflow
 *
 * Handles:
 * - Generating batches of N items based on registry state
 * - Profile-aware scoring when profile exists (uses RecommendationEngine)
 * - Fallback to date-based sorting when no profile configured
 * - Optionally including deferred items when insufficient unprocessed items
 * - Marking selected items as 'proposed' in registry
 * - Learning from user feedback via AdaptiveLearner
 */

import { Notice } from 'obsidian';
import type { ZoteroConnector } from '../db/zotero-connector';
import type { RegistryService } from '../registry/registry-service';
import type { ProfileService } from '../profile/profile-service';
import type { RecommendationEngine } from '../recommendations/recommendation-engine';
import type { AdaptiveLearner } from '../recommendations/adaptive-learner';
import type { BatchOptions, Batch } from './types';
import type { ZoteroItem } from '../types';
import { getErrorContext } from '../error/error-handler';

/**
 * BatchService manages batch generation for the triage workflow
 */
export class BatchService {
  private connector: ZoteroConnector;
  private registry: RegistryService;
  private profileService: ProfileService;
  private recommendationEngine: RecommendationEngine;
  private adaptiveLearner: AdaptiveLearner;

  /**
   * Create a new BatchService
   * @param connector - ZoteroConnector instance for accessing items
   * @param registry - RegistryService instance for state tracking
   * @param profileService - ProfileService instance for profile access
   * @param recommendationEngine - RecommendationEngine for profile-based scoring
   * @param adaptiveLearner - AdaptiveLearner for learning from user feedback
   */
  constructor(
    connector: ZoteroConnector,
    registry: RegistryService,
    profileService: ProfileService,
    recommendationEngine: RecommendationEngine,
    adaptiveLearner: AdaptiveLearner
  ) {
    this.connector = connector;
    this.registry = registry;
    this.profileService = profileService;
    this.recommendationEngine = recommendationEngine;
    this.adaptiveLearner = adaptiveLearner;
  }

  /**
   * Generate a batch of items for triage
   *
   * Algorithm:
   * 1. Get all items from connector cache
   * 2. Filter out imported and rejected items
   * 3. If includeDeferred is false, also filter out deferred items
   * 4. If profile exists: Score items and sort by relevance (highest first)
   *    If no profile: Fall back to date-based sorting (most recent first)
   * 5. Take N items based on options.size
   * 6. Mark selected items as 'proposed' in registry
   *
   * @param options - Batch generation options
   * @returns Generated batch with items and metadata
   */
  async generateBatch(options: BatchOptions): Promise<Batch> {
    try {
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

      // Sort items based on whether profile exists
      let sortedItems: ZoteroItem[];

      if (this.profileService.hasProfile()) {
        // Profile exists: Use recommendation scoring
        const profile = this.profileService.getProfile();
        if (profile) {
          const config = {
            relevanceVsDiversity: profile.relevanceVsDiversity,
            recencyBoost: profile.recencyBoost
          };

          const scoredItems = this.recommendationEngine.scoreItems(availableItems, config);
          const normalizedScores = this.recommendationEngine.normalizeScores(scoredItems);

          // Extract items sorted by score (already sorted by scoreItems method)
          sortedItems = normalizedScores.map(s => s.item);
        } else {
          // Fallback if profile somehow missing
          sortedItems = this.dateSortedItems(availableItems);
        }
      } else {
        // No profile: Use date-based sorting (original behavior)
        sortedItems = this.dateSortedItems(availableItems);
      }

      // Take N items
      const selectedItems = sortedItems.slice(0, options.size);

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
    } catch (err) {
      const context = getErrorContext(err);
      new Notice(`${context.title}: ${context.message}`);
      throw err; // Re-throw for upstream handling
    }
  }

  /**
   * Sort items by dateAdded descending (most recent first)
   * @param items - Items to sort
   * @returns Sorted items array
   */
  private dateSortedItems(items: ZoteroItem[]): ZoteroItem[] {
    return [...items].sort((a, b) => {
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });
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

  /**
   * Record user accepting an item
   * Triggers adaptive learning if profile exists
   * @param item - Accepted Zotero item
   */
  recordAccept(item: ZoteroItem): void {
    if (this.profileService.hasProfile()) {
      this.adaptiveLearner.learnFromAccept(item);
    }
  }

  /**
   * Record user rejecting an item
   * Triggers adaptive learning if profile exists
   * @param item - Rejected Zotero item
   */
  recordReject(item: ZoteroItem): void {
    if (this.profileService.hasProfile()) {
      this.adaptiveLearner.learnFromReject(item);
    }
  }
}
