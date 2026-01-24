/**
 * AdaptiveLearner - Profile evolution from user feedback
 *
 * Learns from user triage decisions (accepts/rejects) to evolve the profile:
 * - Accepts: Boost weights of matching signals (tags, authors, keywords)
 * - Rejects: Diminish weights of matching signals
 *
 * Over time, profile converges to user's true interests (RESEARCH.md Pattern 4).
 */

import type { ZoteroItem } from '../types';
import type { ProfileService } from '../profile/profile-service';
import { extractKeywords } from '../profile/keyword-extractor';

/**
 * Weight adjustment constants (from ProfileService)
 * These must match ProfileService constants for consistency
 */
const ACCEPT_BOOST = 0.2;        // Add to matching signal weights on accept
const REJECT_PENALTY = -0.1;     // Subtract from matching signal weights on reject
const MIN_WEIGHT = 0.1;          // Floor weight (never go below)
const MAX_WEIGHT = 5.0;          // Ceiling weight (prevents runaway)

/**
 * AdaptiveLearner updates profile based on user feedback
 * Follows service class pattern (constructor with dependencies)
 */
export class AdaptiveLearner {
  private profileService: ProfileService;

  /**
   * Create a new AdaptiveLearner
   * @param profileService - Service for updating user profile
   */
  constructor(profileService: ProfileService) {
    this.profileService = profileService;
  }

  /**
   * Learn from user accepting an item
   * Boosts weights of all matching signals (tags, authors, keywords)
   *
   * @param item - Accepted Zotero item
   */
  learnFromAccept(item: ZoteroItem): void {
    const profile = this.profileService.getProfile();
    if (!profile) {
      return; // No profile to learn into
    }

    // Extract signals from item
    const signals = this.extractSignals(item);

    // Boost tag weights
    for (const tag of signals.tags) {
      const currentWeight = profile.tags.get(tag) || 0;
      const newWeight = Math.min(MAX_WEIGHT, currentWeight + ACCEPT_BOOST);
      profile.tags.set(tag, newWeight);
    }

    // Boost author weights
    for (const author of signals.authors) {
      const currentWeight = profile.authors.get(author) || 0;
      const newWeight = Math.min(MAX_WEIGHT, currentWeight + ACCEPT_BOOST);
      profile.authors.set(author, newWeight);
    }

    // Boost keyword weights
    for (const keyword of signals.keywords) {
      const currentWeight = profile.keywords.get(keyword) || 0;
      const newWeight = Math.min(MAX_WEIGHT, currentWeight + ACCEPT_BOOST);
      profile.keywords.set(keyword, newWeight);
    }

    // Update profile via service (triggers debounced save)
    this.profileService.recordAccept(item);
  }

  /**
   * Learn from user rejecting an item
   * Diminishes weights of matching signals (only if signal exists in profile)
   *
   * @param item - Rejected Zotero item
   */
  learnFromReject(item: ZoteroItem): void {
    const profile = this.profileService.getProfile();
    if (!profile) {
      return; // No profile to learn into
    }

    // Extract signals from item
    const signals = this.extractSignals(item);

    // Diminish tag weights (only if exists)
    for (const tag of signals.tags) {
      const currentWeight = profile.tags.get(tag);
      if (currentWeight !== undefined) {
        const newWeight = Math.max(MIN_WEIGHT, currentWeight + REJECT_PENALTY);
        profile.tags.set(tag, newWeight);
      }
      // Don't add negative signals (ignore if not in profile)
    }

    // Diminish author weights (only if exists)
    for (const author of signals.authors) {
      const currentWeight = profile.authors.get(author);
      if (currentWeight !== undefined) {
        const newWeight = Math.max(MIN_WEIGHT, currentWeight + REJECT_PENALTY);
        profile.authors.set(author, newWeight);
      }
    }

    // Diminish keyword weights (only if exists)
    for (const keyword of signals.keywords) {
      const currentWeight = profile.keywords.get(keyword);
      if (currentWeight !== undefined) {
        const newWeight = Math.max(MIN_WEIGHT, currentWeight + REJECT_PENALTY);
        profile.keywords.set(keyword, newWeight);
      }
    }

    // Update profile via service (triggers debounced save)
    this.profileService.recordReject(item);
  }

  /**
   * Extract signals from a Zotero item
   * Returns tags, authors, and keywords for profile learning
   *
   * @param item - Zotero item to extract signals from
   * @returns Object with extracted signals
   */
  private extractSignals(item: ZoteroItem): {
    tags: string[];
    authors: string[];
    keywords: string[];
  } {
    // Tags: Currently not available in ZoteroItem schema
    // Will be populated when tag extraction is added to ZoteroConnector
    const tags: string[] = [];

    // Authors: Direct from item (normalize to lowercase for consistency)
    const authors = item.authors.map(a => a.toLowerCase());

    // Keywords: Extract from title + abstract using keyword-extractor
    const text = [item.title, item.abstract]
      .filter(t => t !== null)
      .join(' ');

    const keywords = extractKeywords(text, {
      maxKeywords: 20,  // Extract up to 20 keywords
      minLength: 4      // Minimum 4 characters
    });

    return {
      tags,
      authors,
      keywords
    };
  }
}
