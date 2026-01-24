/**
 * ProfileService - User profile management and persistence
 *
 * Manages user research interest profiles including:
 * - CRUD operations for profiles
 * - Signal weight management (tags, authors, keywords)
 * - Learning from user feedback (accepts/rejects)
 * - Debounced persistence to plugin settings
 */

import { Plugin } from 'obsidian';
import debounce from 'lodash.debounce';
import type { UserProfile, ProfileSignal } from './types';
import type { ZoteroItem } from '../types';

/** Debounce delay for save operations in milliseconds */
const SAVE_DEBOUNCE_MS = 2000;

/** Weight adjustment constants for adaptive learning */
const ACCEPT_BOOST = 0.2;        // Add to matching signal weights on accept
const REJECT_PENALTY = -0.1;     // Subtract from matching signal weights on reject
const MIN_WEIGHT = 0.1;          // Floor weight (never go below)
const MAX_WEIGHT = 5.0;          // Ceiling weight (prevents runaway)

/**
 * ProfileService manages user profile state and persistence
 * Follows RegistryService pattern: class with plugin ref, debounced saves
 */
export class ProfileService {
  private plugin: Plugin;
  private debouncedSave: ReturnType<typeof debounce>;

  /**
   * Create a new ProfileService
   * @param plugin - Obsidian plugin instance (for saveData/loadData)
   */
  constructor(plugin: Plugin) {
    this.plugin = plugin;

    // Create debounced save function
    this.debouncedSave = debounce(async () => {
      await this.saveToSettings();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Get current user profile
   * @returns UserProfile if exists, null otherwise
   */
  getProfile(): UserProfile | null {
    const settings = (this.plugin as any).settings;
    const rawProfile = settings?.userProfile;

    if (!rawProfile) {
      return null;
    }

    // Deserialize Maps from plain objects
    return this.deserializeProfile(rawProfile);
  }

  /**
   * Deserialize profile from JSON storage
   * Converts plain objects back to Maps
   */
  private deserializeProfile(raw: any): UserProfile {
    return {
      tags: new Map(Object.entries(raw.tags || {})),
      authors: new Map(Object.entries(raw.authors || {})),
      keywords: new Map(Object.entries(raw.keywords || {})),
      seedPaperIds: raw.seedPaperIds || [],
      relevanceVsDiversity: raw.relevanceVsDiversity || 0,
      recencyBoost: raw.recencyBoost !== undefined ? raw.recencyBoost : true,
      createdAt: raw.createdAt || Date.now(),
      updatedAt: raw.updatedAt || Date.now()
    };
  }

  /**
   * Check if user has configured a profile
   * @returns true if profile exists
   */
  hasProfile(): boolean {
    return this.getProfile() !== null;
  }

  /**
   * Create new profile from seed papers and preferences
   * Signals will be extracted later (see keyword-extractor.ts)
   * @param seedPaperIds - Zotero item IDs to use as seeds
   * @param preferences - User preferences for recommendations
   * @returns Newly created profile
   */
  createProfile(
    seedPaperIds: string[],
    preferences: { relevanceVsDiversity: number; recencyBoost: boolean }
  ): UserProfile {
    const now = Date.now();

    const profile: UserProfile = {
      tags: new Map<string, number>(),
      authors: new Map<string, number>(),
      keywords: new Map<string, number>(),
      seedPaperIds,
      relevanceVsDiversity: preferences.relevanceVsDiversity,
      recencyBoost: preferences.recencyBoost,
      createdAt: now,
      updatedAt: now
    };

    // Save immediately (not debounced) since this is explicit user action
    const settings = (this.plugin as any).settings;
    settings.userProfile = this.serializeProfile(profile);
    (this.plugin as any).saveSettings();

    return profile;
  }

  /**
   * Update profile with partial updates
   * @param updates - Partial profile data to merge
   */
  updateProfile(updates: Partial<UserProfile>): void {
    const current = this.getProfile();
    if (!current) {
      throw new Error('Cannot update profile: no profile exists');
    }

    // Merge updates
    const updated: UserProfile = {
      ...current,
      ...updates,
      updatedAt: Date.now()
    };

    // Update settings
    const settings = (this.plugin as any).settings;
    settings.userProfile = this.serializeProfile(updated);

    // Debounced save
    this.debouncedSave();
  }

  /**
   * Clear profile (reset to null)
   */
  clearProfile(): void {
    const settings = (this.plugin as any).settings;
    settings.userProfile = null;
    (this.plugin as any).saveSettings();
  }

  /**
   * Add or increment weight for a signal
   * @param signal - Signal to add/update
   */
  addSignal(signal: ProfileSignal): void {
    const profile = this.getProfile();
    if (!profile) {
      throw new Error('Cannot add signal: no profile exists');
    }

    const map = this.getSignalMap(profile, signal.type);
    const currentWeight = map.get(signal.value) || 0;
    const newWeight = Math.min(MAX_WEIGHT, currentWeight + signal.weight);

    map.set(signal.value, newWeight);

    profile.updatedAt = Date.now();
    this.updateProfile(profile);
  }

  /**
   * Remove signal from profile
   * @param type - Signal type
   * @param value - Signal value to remove
   */
  removeSignal(type: 'tag' | 'author' | 'keyword', value: string): void {
    const profile = this.getProfile();
    if (!profile) {
      throw new Error('Cannot remove signal: no profile exists');
    }

    const map = this.getSignalMap(profile, type);
    map.delete(value);

    profile.updatedAt = Date.now();
    this.updateProfile(profile);
  }

  /**
   * Adjust signal weight by delta
   * @param type - Signal type
   * @param value - Signal value
   * @param delta - Amount to add (can be negative)
   */
  adjustWeight(type: 'tag' | 'author' | 'keyword', value: string, delta: number): void {
    const profile = this.getProfile();
    if (!profile) {
      throw new Error('Cannot adjust weight: no profile exists');
    }

    const map = this.getSignalMap(profile, type);
    const currentWeight = map.get(value) || 0;
    const newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, currentWeight + delta));

    map.set(value, newWeight);

    profile.updatedAt = Date.now();
    this.updateProfile(profile);
  }

  /**
   * Get top N signals by weight for a given type
   * @param type - Signal type
   * @param limit - Maximum number of signals to return
   * @returns Array of signals sorted by weight (descending)
   */
  getTopSignals(type: 'tag' | 'author' | 'keyword', limit: number): ProfileSignal[] {
    const profile = this.getProfile();
    if (!profile) {
      return [];
    }

    const map = this.getSignalMap(profile, type);
    const signals: ProfileSignal[] = [];

    for (const [value, weight] of map.entries()) {
      signals.push({
        type,
        value,
        weight,
        source: 'seed' // Default source; actual source tracking would require extending storage
      });
    }

    // Sort by weight descending, take top N
    return signals
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  /**
   * Record user accepting an item - boost matching signals
   * @param item - Accepted Zotero item
   */
  recordAccept(item: ZoteroItem): void {
    const profile = this.getProfile();
    if (!profile) {
      return; // No profile, nothing to learn
    }

    // Boost author weights
    for (const author of item.authors) {
      const currentWeight = profile.authors.get(author) || 0;
      const newWeight = Math.min(MAX_WEIGHT, currentWeight + ACCEPT_BOOST);
      profile.authors.set(author, newWeight);
    }

    // Note: Tag and keyword boosting will be implemented when those are extracted
    // from Zotero items in later tasks

    profile.updatedAt = Date.now();
    this.updateProfile(profile);
  }

  /**
   * Record user rejecting an item - diminish matching signals
   * @param item - Rejected Zotero item
   */
  recordReject(item: ZoteroItem): void {
    const profile = this.getProfile();
    if (!profile) {
      return; // No profile, nothing to learn
    }

    // Diminish author weights
    for (const author of item.authors) {
      const currentWeight = profile.authors.get(author);
      if (currentWeight !== undefined) {
        const newWeight = Math.max(MIN_WEIGHT, currentWeight + REJECT_PENALTY);
        profile.authors.set(author, newWeight);
      }
    }

    // Note: Tag and keyword penalties will be implemented when those are extracted
    // from Zotero items in later tasks

    profile.updatedAt = Date.now();
    this.updateProfile(profile);
  }

  /**
   * Immediately save any pending changes
   * Call this before plugin unload to ensure data is persisted
   */
  async flush(): Promise<void> {
    // Cancel any pending debounced save
    this.debouncedSave.cancel();

    // Perform immediate save
    await this.saveToSettings();
  }

  /**
   * Get the appropriate signal map from profile
   */
  private getSignalMap(
    profile: UserProfile,
    type: 'tag' | 'author' | 'keyword'
  ): Map<string, number> {
    switch (type) {
      case 'tag':
        return profile.tags;
      case 'author':
        return profile.authors;
      case 'keyword':
        return profile.keywords;
    }
  }

  /**
   * Save profile to plugin settings
   */
  private async saveToSettings(): Promise<void> {
    await (this.plugin as any).saveSettings();
  }

  /**
   * Serialize profile for JSON storage
   * Maps need to be converted to objects for JSON
   */
  private serializeProfile(profile: UserProfile): any {
    return {
      tags: Object.fromEntries(profile.tags),
      authors: Object.fromEntries(profile.authors),
      keywords: Object.fromEntries(profile.keywords),
      seedPaperIds: profile.seedPaperIds,
      relevanceVsDiversity: profile.relevanceVsDiversity,
      recencyBoost: profile.recencyBoost,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  }
}
