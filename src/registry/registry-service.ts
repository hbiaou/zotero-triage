/**
 * RegistryService - State persistence for processed Zotero items
 *
 * Tracks which items have been seen, proposed, accepted, rejected, or imported.
 * Persists state via Obsidian's plugin data storage with debounced writes.
 */

import { Plugin } from 'obsidian';
import debounce from 'lodash.debounce';
import type { Registry, RegistryEntry, RegistryState, RegistryStats } from './types';
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
        console.warn('ZotBridge: Invalid registry data, resetting to default');
        this.registry = this.getDefault();
        return;
      }

      // Check for version mismatch (future-proofing for migrations)
      if (loaded.version !== 1) {
        console.log(`ZotBridge: Registry version ${loaded.version}, current is 1`);
        // Future: handle migrations here
      }

      this.registry = loaded;
      console.log(`ZotBridge: Loaded registry with ${Object.keys(this.registry.entries).length} entries`);
    } catch (err) {
      console.error('ZotBridge: Failed to load registry', err);
      this.registry = this.getDefault();
    }
  }

  /**
   * Get the processing state for an item
   * @param itemId - Zotero item ID (number or string)
   * @returns Current state, defaults to 'unseen' if not tracked
   */
  getState(itemId: string | number): RegistryState {
    const normalizedKey = normalizeItemKey(itemId);
    return this.registry.entries[normalizedKey]?.state ?? 'unseen';
  }

  /**
   * Update the processing state for an item
   * @param itemId - Zotero item ID (number or string)
   * @param state - New state to set
   */
  markState(itemId: string | number, state: RegistryState): void {
    const normalizedKey = normalizeItemKey(itemId);

    this.registry.entries[normalizedKey] = {
      state,
      timestamp: Date.now()
    };

    this.debouncedSave();
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
  getStats(): RegistryStats {
    const stats: RegistryStats = {
      total: 0,
      unseen: 0,
      proposed: 0,
      accepted: 0,
      rejected: 0,
      deferred: 0,
      imported: 0
    };

    for (const entry of Object.values(this.registry.entries)) {
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
  getEntriesByState(state: RegistryState): string[] {
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
