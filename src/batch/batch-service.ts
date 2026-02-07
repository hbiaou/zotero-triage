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

import { Notice, App } from 'obsidian';
import type { ZoteroConnector } from '../db/zotero-connector';
import type { RegistryService } from '../registry/registry-service';
import type { ProfileService } from '../profile/profile-service';
import type { RecommendationEngine } from '../recommendations/recommendation-engine';
import type { AdaptiveLearner } from '../recommendations/adaptive-learner';
import type { DomainClassifier } from '../classification/domain-classifier';
import type { EvidenceExtractor } from '../services/evidence-extractor';
import type { BatchOptions, Batch } from './types';
import type { ZoteroItem } from '../types';
import type { Domain } from '../classification/types';
import type { ValidationService } from '../validation/validation-service';
import { getErrorContext } from '../error/error-handler';
import { ProgressTracker } from '../performance/progress-tracker';
import { ClassificationModal } from '../ui/classification-modal';

/**
 * BatchService manages batch generation for the triage workflow
 */
export class BatchService {
  private static readonly BATCH_SIZE = 100; // Progress update frequency
  private static readonly CONFIDENCE_THRESHOLD = 0.70; // Classification confidence threshold for override modal
  private connector: ZoteroConnector;
  private registry: RegistryService;
  private profileService: ProfileService;
  private recommendationEngine: RecommendationEngine;
  private adaptiveLearner: AdaptiveLearner;
  private domainClassifier: DomainClassifier;
  private evidenceExtractor: EvidenceExtractor;
  private validationService: ValidationService;
  private app: App;

  /**
   * Create a new BatchService
   * @param connector - ZoteroConnector instance for accessing items
   * @param registry - RegistryService instance for state tracking
   * @param profileService - ProfileService instance for profile access
   * @param recommendationEngine - RecommendationEngine for profile-based scoring
   * @param adaptiveLearner - AdaptiveLearner for learning from user feedback
   * @param domainClassifier - DomainClassifier for item classification
   * @param evidenceExtractor - EvidenceExtractor for content extraction
   * @param app - Obsidian app instance for modal display
   */
  constructor(
    connector: ZoteroConnector,
    registry: RegistryService,
    profileService: ProfileService,
    recommendationEngine: RecommendationEngine,
    adaptiveLearner: AdaptiveLearner,
    domainClassifier: DomainClassifier,
    evidenceExtractor: EvidenceExtractor,
    validationService: ValidationService,
    app: App
  ) {
    this.connector = connector;
    this.registry = registry;
    this.profileService = profileService;
    this.recommendationEngine = recommendationEngine;
    this.adaptiveLearner = adaptiveLearner;
    this.domainClassifier = domainClassifier;
    this.evidenceExtractor = evidenceExtractor;
    this.validationService = validationService;
    this.app = app;
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
    const progress = new ProgressTracker();

    try {
      progress.start('Filtering candidates...', 100); // Arbitrary estimate

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

        // Optionally exclude deferred items
        if (!options.includeDeferred && state === 'deferred') {
          return false;
        }

        // Validate item quality if gates are enabled
        // This filters out items with missing required fields (e.g. no DOI/Abstract)
        const validation = this.validationService.validate(item);
        if (!validation.valid) {
          // Log only if verbose debugging enabled, otherwise it's expected filtering
          // console.log(`[BatchService] Filtered invalid item ${item.itemID}: ${validation.errors.map(e => e.message).join(', ')}`);
          return false;
        }

        return true;
      });

      // Update progress tracker with actual total
      progress['state'].total = availableItems.length;
      progress.update(0, `Scoring ${availableItems.length} candidates...`);

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

          // Score items with progress updates every 100 items
          const scoredItems = this.recommendationEngine.scoreItems(
            availableItems,
            config,
            (scored) => progress.update(scored, `Scoring candidates...`)
          );

          // Update progress after scoring
          progress.update(availableItems.length, 'Normalizing scores...');

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
        progress.update(availableItems.length, 'Sorted by date...');
      }

      progress.update(availableItems.length, 'Selecting batch...');

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

      progress.complete();

      return {
        items: selectedItems,
        generatedAt: Date.now(),
        includesDeferred
      };
    } catch (err) {
      progress.error('Failed to generate batch');
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
   * Triggers adaptive learning if profile exists, classifies item into domain,
   * and stores classification metadata for enrichment workflow
   * @param item - Accepted Zotero item
   */
  async recordAccept(item: ZoteroItem): Promise<void> {
    // Existing learning logic
    if (this.profileService.hasProfile()) {
      this.adaptiveLearner.learnFromAccept(item);
    }

    // NEW: Classify item into domain
    try {
      // Extract evidence for classification
      const evidence = await this.evidenceExtractor.extract(item);

      // Classify item based on metadata and evidence
      const classificationResult = await this.domainClassifier.classify(item, evidence);

      let domainToUse: Domain = classificationResult.domain;

      // Show modal if confidence is below threshold and not a hard override
      if (
        classificationResult.confidence < BatchService.CONFIDENCE_THRESHOLD &&
        !classificationResult.isHardOverride
      ) {
        // Show classification modal and wait for user selection
        domainToUse = await new Promise<Domain>((resolve, reject) => {
          const modal = new ClassificationModal(
            this.app,
            item,
            classificationResult,
            (selectedDomain: Domain) => {
              resolve(selectedDomain);
            },
            () => {
              // User cancelled - use suggested domain anyway
              resolve(classificationResult.domain);
            }
          );
          modal.open();
        });
      }

      // Store classification in enrichment metadata
      this.registry.setEnrichmentMetadata(item.itemID, {
        knowledge_domain: domainToUse,
        classification_confidence: classificationResult.confidence,
        template_used: domainToUse.toUpperCase(),
        evidenceLevel: evidence.level
      });
    } catch (err) {
      // Classification failed - log error but don't block workflow
      console.error('Zotero Triage: Classification failed for item', item.itemID, err);

      // Store fallback classification (General domain)
      this.registry.setEnrichmentMetadata(item.itemID, {
        knowledge_domain: 'General',
        classification_confidence: 0.0,
        template_used: 'GENERAL'
      });
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
