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
import type { UserProfile } from '../profile/types';
import { extractKeywords } from '../profile/keyword-extractor';
import { normalizeTag } from '../utils/stemming';

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
  private feedbackCount = 0;

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

    // Apply weight decay every 10 feedback events
    this.feedbackCount++;
    if (this.feedbackCount % 10 === 0) {
      this.applyWeightDecay(profile);
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

    // Apply weight decay every 10 feedback events
    this.feedbackCount++;
    if (this.feedbackCount % 10 === 0) {
      this.applyWeightDecay(profile);
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
    // Extract tags from item (now available from Phase 6)
    const tags = (item.tags || [])
      .map(t => normalizeTag(t))  // Use normalizeTag from stemming.ts
      .filter(t => t.length > 0);

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

  /**
   * Apply exponential decay to all profile weights.
   * Gradually returns weights toward baseline (1.0) to prevent permanent extremes.
   * Uses exponential moving average: weight = weight * 0.95 + baseline * 0.05
   *
   * Call this periodically (e.g., after every 10 feedback events).
   */
  private applyWeightDecay(profile: UserProfile): void {
    const DECAY_FACTOR = 0.95;  // 95% current, 5% baseline
    const BASELINE_WEIGHT = 1.0;

    // Decay tag weights
    for (const [tag, weight] of profile.tags.entries()) {
      const decayed = weight * DECAY_FACTOR + BASELINE_WEIGHT * (1 - DECAY_FACTOR);
      profile.tags.set(tag, Math.max(MIN_WEIGHT, decayed));
    }

    // Decay author weights
    for (const [author, weight] of profile.authors.entries()) {
      const decayed = weight * DECAY_FACTOR + BASELINE_WEIGHT * (1 - DECAY_FACTOR);
      profile.authors.set(author, Math.max(MIN_WEIGHT, decayed));
    }

    // Decay keyword weights
    for (const [keyword, weight] of profile.keywords.entries()) {
      const decayed = weight * DECAY_FACTOR + BASELINE_WEIGHT * (1 - DECAY_FACTOR);
      profile.keywords.set(keyword, Math.max(MIN_WEIGHT, decayed));
    }
  }
}
