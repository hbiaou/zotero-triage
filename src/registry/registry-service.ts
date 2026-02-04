/**
 * RegistryService - State persistence for processed Zotero items
 *
 * Tracks which items have been seen, proposed, accepted, rejected, or imported.
 * Persists state via Obsidian's plugin data storage with debounced writes.
 */

import { Plugin } from 'obsidian';
import debounce from 'lodash.debounce';
import type { Registry, RegistryEntry, RegistryStats } from './types';
import type { ProcessingState } from '../types';
import { normalizeItemKey } from '../utils/normalization';

/** Debounce delay for save operations in milliseconds */
const SAVE_DEBOUNCE_MS = 2000;

/**
 * RegistryService manages item state persistence
 */
export class RegistryService {
  private registry: Registry;
  private plugin: Plugin;
  private debouncedSave: ReturnType<typeof debounce>;

  /**
   * Create a new RegistryService
   * @param plugin - Obsidian plugin instance (for saveData/loadData)
   */
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.registry = this.getDefault();

    // Create debounced save function
    this.debouncedSave = debounce(async () => {
      this.registry.lastModified = Date.now();
      const data = await this.plugin.loadData() || {};
      data.registry = this.registry;
      await this.plugin.saveData(data);
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Load registry from plugin storage
   * Call this during plugin initialization
   */
  async load(): Promise<void> {
    try {
      const data = await this.plugin.loadData();

      if (!data?.registry) {
        // No existing registry, use default
        this.registry = this.getDefault();
        return;
      }

      const loaded = data.registry as Registry;

      // Validate registry structure
      if (!loaded.entries || typeof loaded.entries !== 'object') {
        console.warn('Zotero Triage: Invalid registry data, resetting to default');
        this.registry = this.getDefault();
        return;
      }

      // Check for version mismatch (future-proofing for migrations)
      if (loaded.version !== 1) {
        console.log(`Zotero Triage: Registry version ${loaded.version}, current is 1`);
        // Future: handle migrations here
      }

      this.registry = loaded;
      console.log(`Zotero Triage: Loaded registry with ${Object.keys(this.registry.entries).length} entries`);
    } catch (err) {
      console.error('Zotero Triage: Failed to load registry', err);
      this.registry = this.getDefault();
    }
  }

  /**
   * Get the processing state for an item
   * @param itemId - Zotero item ID (number or string)
   * @returns Current state, defaults to 'unseen' if not tracked
   */
  getState(itemId: string | number): ProcessingState {
    const normalizedKey = normalizeItemKey(itemId);
    return this.registry.entries[normalizedKey]?.state ?? 'unseen';
  }

  /**
   * Update the processing state for an item
   * @param itemId - Zotero item ID (number or string)
   * @param state - New state to set
   */
  markState(itemId: string | number, state: ProcessingState): void {
    const normalizedKey = normalizeItemKey(itemId);

    this.registry.entries[normalizedKey] = {
      state,
      timestamp: Date.now()
    };

    this.debouncedSave();
  }

  /**
   * Update enrichment metadata for an item
   * @param itemId - Zotero item ID (number or string)
   * @param metadata - Partial enrichment metadata to merge with existing metadata
   */
  setEnrichmentMetadata(
    itemId: string | number,
    metadata: Partial<NonNullable<RegistryEntry['enrichmentMetadata']>>
  ): void {
    const normalizedKey = normalizeItemKey(itemId);
    const entry = this.registry.entries[normalizedKey];

    if (!entry) {
      // Create entry if it doesn't exist
      this.registry.entries[normalizedKey] = {
        state: 'unseen',
        timestamp: Date.now(),
        enrichmentMetadata: metadata
      };
    } else {
      // Merge with existing metadata
      entry.enrichmentMetadata = {
        ...entry.enrichmentMetadata,
        ...metadata
      };
    }

    this.debouncedSave();
  }

  /**
   * Save a manual transcript for an item
   * @param itemId - Zotero item ID (number or string)
   * @param transcript - Transcript content
   */
  saveManualTranscript(itemId: string | number, transcript: string): void {
    const normalizedKey = normalizeItemKey(itemId);
    const entry = this.registry.entries[normalizedKey];

    if (!entry) {
      // Create entry if it doesn't exist
      this.registry.entries[normalizedKey] = {
        state: 'unseen',
        timestamp: Date.now(),
        manualTranscript: transcript
      };
    } else {
      // Update existing entry
      entry.manualTranscript = transcript;
    }



    this.debouncedSave();
  }

  /**
   * Get manual transcript if available
   * @param itemId - Zotero item ID (number or string)
   * @returns Manual transcript or undefined
   */
  getManualTranscript(itemId: string | number): string | undefined {
    const normalizedKey = normalizeItemKey(itemId);
    return this.registry.entries[normalizedKey]?.manualTranscript;
  }

  /**
   * Check if an item has been imported
   * @param itemId - Zotero item ID (number or string)
   * @returns true if item state is 'imported'
   */
  isImported(itemId: string | number): boolean {
    return this.getState(itemId) === 'imported';
  }

  /**
   * Get statistics on registry state distribution
   * @returns Stats object with counts per state
   */
  getStats(validItemIds?: Set<number>): RegistryStats {
    const stats: RegistryStats = {
      total: 0,
      unseen: 0,
      proposed: 0,
      accepted: 0,
      rejected: 0,
      deferred: 0,
      imported: 0,
      enriched: 0,
      enrichment_pending: 0,
      enrichment_failed: 0
    };

    for (const [key, entry] of Object.entries(this.registry.entries)) {
      // If filtering is enabled, skip entries not in validItemIds
      if (validItemIds) {
        // Extract numeric ID from key (handling potential normalization differences)
        // Normalized key is usually just the ID as string
        const id = parseInt(key, 10);
        if (!isNaN(id) && !validItemIds.has(id)) {
          continue;
        }
      }

      stats.total++;
      stats[entry.state]++;
    }

    return stats;
  }

  /**
   * Get all item IDs in a specific state
   * @param state - State to filter by
   * @returns Array of item ID strings
   */
  getEntriesByState(state: ProcessingState): string[] {
    const result: string[] = [];

    for (const [id, entry] of Object.entries(this.registry.entries)) {
      if (entry.state === state) {
        result.push(id);
      }
    }

    return result;
  }

  /**
   * Get all registry entries with their IDs
   * @returns Array of objects with id and entry
   */
  getAllEntries(): Array<{ id: string, entry: RegistryEntry }> {
    const result: Array<{ id: string, entry: RegistryEntry }> = [];

    for (const [id, entry] of Object.entries(this.registry.entries)) {
      result.push({ id, entry });
    }

    return result;
  }

  /**
   * Immediately save any pending changes.
   * Call this before plugin unload to ensure data is persisted.
   */
  async flush(): Promise<void> {
    // Cancel any pending debounced save
    this.debouncedSave.cancel();

    // Perform immediate save
    this.registry.lastModified = Date.now();
    const data = await this.plugin.loadData() || {};
    data.registry = this.registry;
    await this.plugin.saveData(data);
  }

  /**
   * Get default empty registry
   */
  private getDefault(): Registry {
    return {
      version: 1,
      entries: {},
      lastModified: Date.now()
    };
  }
}
