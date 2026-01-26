/**
 * RecommendationEngine - Profile-aware item scoring
 *
 * Scores Zotero items based on user profile similarity using multi-signal algorithm:
 * - Tag matching: Direct tag overlap with profile tags
 * - Author matching: Author name matching (case-insensitive)
 * - Keyword matching: Extracted keywords from title/abstract
 * - Recency boost: Boost recent publications
 * - Diversity penalty: Reduce redundancy when configured
 *
 * Implements frequency-weighted scoring (RESEARCH.md Algorithm 1)
 */

import type { ZoteroItem, ZoteroTriageSettings } from '../types';
import type { UserProfile } from '../profile/types';
import { DEFAULT_PROFILE_WEIGHTS } from '../profile/types';
import type { ProfileService } from '../profile/profile-service';
import type { ZoteroConnector } from '../db/zotero-connector';
import type { ScoredItem, RecommendationConfig } from './types';
import { extractKeywords } from '../profile/keyword-extractor';
import { normalizeTag } from '../utils/stemming';

/**
 * Default recommendation configuration
 */
const DEFAULT_CONFIG: RecommendationConfig = {
  relevanceVsDiversity: 0,    // Pure relevance (no diversity penalty)
  recencyBoost: true,          // Boost recent papers
  recencyYears: 3,             // Last 3 years
  recencyMultiplier: 1.5       // 50% boost for recent items
};

/**
 * RecommendationEngine scores items based on profile similarity
 * Follows service class pattern (constructor with dependencies)
 */
export class RecommendationEngine {
  private profileService: ProfileService;
  private zoteroConnector: ZoteroConnector;
  private settings: ZoteroTriageSettings;

  /**
   * Create a new RecommendationEngine
   * @param profileService - Service for accessing user profile
   * @param zoteroConnector - Connector for accessing Zotero data
   * @param settings - Plugin settings for accessing tag weight configuration
   */
  constructor(
    profileService: ProfileService,
    zoteroConnector: ZoteroConnector,
    settings: ZoteroTriageSettings
  ) {
    this.profileService = profileService;
    this.zoteroConnector = zoteroConnector;
    this.settings = settings;
  }

  /**
   * Score items based on profile similarity
   * Returns items sorted by relevance (highest score first)
   *
   * @param items - Items to score
   * @param config - Optional configuration overrides
   * @returns Scored items sorted by score descending
   */
  scoreItems(
    items: ZoteroItem[],
    config?: Partial<RecommendationConfig>
  ): ScoredItem[] {
    const fullConfig: RecommendationConfig = {
      ...DEFAULT_CONFIG,
      ...config
    };

    const profile = this.profileService.getProfile();

    // Cold-start handling: no profile means random scores
    if (!profile || this.isProfileEmpty(profile)) {
      return this.coldStartScoring(items);
    }

    // Score each item based on profile
    const scoredItems = items.map(item =>
      this.scoreItem(item, profile, fullConfig)
    );

    // Apply diversity penalty if configured
    if (fullConfig.relevanceVsDiversity > 0) {
      return this.applyDiversityPenalty(scoredItems, fullConfig.relevanceVsDiversity);
    }

    // Sort by score descending (pure relevance)
    return scoredItems.sort((a, b) => b.score - a.score);
  }

  /**
   * Score a single item against the profile
   */
  private scoreItem(
    item: ZoteroItem,
    profile: UserProfile,
    config: RecommendationConfig
  ): ScoredItem {
    // Calculate signal scores
    const tagScore = this.calculateTagScore(item, profile);
    const authorScore = this.calculateAuthorScore(item, profile);
    const keywordScore = this.calculateKeywordScore(item, profile);

    // Get tag weight from settings (dynamic, user-configurable)
    const tagWeightMultiplier = this.settings.tagWeight ?? DEFAULT_PROFILE_WEIGHTS.tagWeight;

    // Apply profile weights to each signal type
    const rawScore =
      (tagScore * tagWeightMultiplier) +
      (authorScore * DEFAULT_PROFILE_WEIGHTS.authorWeight) +
      (keywordScore * DEFAULT_PROFILE_WEIGHTS.keywordWeight);

    // Apply recency boost if configured
    let finalScore = rawScore;
    let recencyBoost = 1.0;

    if (config.recencyBoost && item.year) {
      const currentYear = new Date().getFullYear();
      const itemYear = parseInt(item.year, 10);

      if (!isNaN(itemYear) && itemYear >= (currentYear - config.recencyYears)) {
        recencyBoost = config.recencyMultiplier;
        finalScore *= recencyBoost;
      }
    }

    const scoredItem = {
      item,
      score: finalScore, // Will be normalized after all items scored
      scoreBreakdown: {
        tagScore,
        authorScore,
        keywordScore,
        recencyBoost
      }
    };

    // Debug logging for score verification (Phase 7)
    if (tagScore > 0 || authorScore > 0 || keywordScore > 0) {
      console.log('[RecommendationEngine] Scored item:', {
        title: item.title?.substring(0, 60) + '...',
        tagScore: tagScore.toFixed(2),
        authorScore: authorScore.toFixed(2),
        keywordScore: keywordScore.toFixed(2),
        recencyBoost: recencyBoost.toFixed(2),
        finalScore: finalScore.toFixed(2),
        itemTags: item.tags?.slice(0, 5) || []
      });
    }

    return scoredItem;
  }

  /**
   * Calculate tag match score
   * Sum weights of matching tags from profile
   *
   * Algorithm:
   * 1. Handle items with no tags (return 0, neutral - not a penalty)
   * 2. Normalize item tags using normalizeTag() (lowercase + stemming)
   * 3. Normalize profile tags using normalizeTag()
   * 4. Match and score: for each normalized item tag, check if it matches any normalized profile tag
   * 5. Sum weights: Linear multi-match scoring - add weight of ALL matching profile tags
   * 6. Return raw score (normalization happens in scoreItem caller)
   *
   * Multi-word tag handling: Exact match after stemming (don't split)
   * 'machine learning' only matches 'machine learning', not 'machine' or 'learning' separately
   *
   * @param item - Zotero item with tags field
   * @param profile - User profile with tag weights
   * @returns Raw tag match score
   */
  private calculateTagScore(item: ZoteroItem, profile: UserProfile): number {
    // Handle items with no tags (neutral, no penalty)
    if (!item.tags || item.tags.length === 0) {
      return 0;
    }

    // Normalize item tags
    const itemTags = item.tags
      .map(t => normalizeTag(t))
      .filter(t => t.length > 0);

    if (itemTags.length === 0) {
      return 0;
    }

    // Build normalized profile tag map
    const normalizedProfile = new Map<string, number>();
    for (const [tag, weight] of profile.tags.entries()) {
      const normalized = normalizeTag(tag);
      if (normalized) {
        normalizedProfile.set(normalized, weight);
      }
    }

    // Linear multi-match: sum all matching weights
    let score = 0;
    for (const itemTag of itemTags) {
      const weight = normalizedProfile.get(itemTag);
      if (weight !== undefined) {
        score += weight;
      }
    }

    return score;
  }

  /**
   * Calculate author match score
   * Sum weights of matching authors (case-insensitive)
   */
  private calculateAuthorScore(item: ZoteroItem, profile: UserProfile): number {
    let score = 0;

    for (const author of item.authors) {
      // Normalize author name for matching (lowercase)
      const normalizedAuthor = author.toLowerCase();

      // Check if profile has this author
      for (const [profileAuthor, weight] of profile.authors.entries()) {
        if (profileAuthor.toLowerCase() === normalizedAuthor) {
          score += weight;
          break; // Only count each author once
        }
      }
    }

    return score;
  }

  /**
   * Calculate keyword match score
   * Extract keywords from title + abstract, sum weights of matches
   */
  private calculateKeywordScore(item: ZoteroItem, profile: UserProfile): number {
    // Combine title and abstract for keyword extraction
    const text = [item.title, item.abstract]
      .filter(t => t !== null)
      .join(' ');

    if (!text.trim()) {
      return 0;
    }

    // Extract keywords from item text
    const keywords = extractKeywords(text, { maxKeywords: 20 });

    // Sum weights for matching keywords
    let score = 0;
    for (const keyword of keywords) {
      const weight = profile.keywords.get(keyword);
      if (weight !== undefined) {
        score += weight;
      }
    }

    return score;
  }

  /**
   * Check if profile is empty (no signals)
   */
  private isProfileEmpty(profile: UserProfile): boolean {
    return (
      profile.tags.size === 0 &&
      profile.authors.size === 0 &&
      profile.keywords.size === 0
    );
  }

  /**
   * Cold-start scoring: assign random scores when no profile exists
   * Gives users a starting point to begin accepting/rejecting
   */
  private coldStartScoring(items: ZoteroItem[]): ScoredItem[] {
    return items.map(item => ({
      item,
      score: Math.random() * 100,
      scoreBreakdown: {
        tagScore: 0,
        authorScore: 0,
        keywordScore: 0,
        recencyBoost: 1.0
      }
    })).sort((a, b) => b.score - a.score);
  }

  /**
   * Apply diversity penalty to reduce redundancy
   * When relevanceVsDiversity > 0, penalize items that match previously selected items
   *
   * Algorithm:
   * 1. Sort by score descending
   * 2. Track signals from selected items
   * 3. For each subsequent item, reduce score based on signal overlap
   * 4. Re-sort after penalties applied
   */
  private applyDiversityPenalty(
    scoredItems: ScoredItem[],
    diversityWeight: number
  ): ScoredItem[] {
    // Sort by initial score
    const sorted = [...scoredItems].sort((a, b) => b.score - a.score);

    // Track signals from selected items
    const selectedAuthors = new Set<string>();
    const selectedKeywords = new Set<string>();

    // Apply penalties
    const withPenalty = sorted.map((scoredItem, index) => {
      if (index === 0) {
        // First item: no penalty, add its signals to tracking sets
        this.trackSignals(scoredItem.item, selectedAuthors, selectedKeywords);
        return scoredItem;
      }

      // Count how many signals this item shares with previous selections
      let matchCount = 0;

      // Check author overlap
      for (const author of scoredItem.item.authors) {
        if (selectedAuthors.has(author.toLowerCase())) {
          matchCount++;
        }
      }

      // Check keyword overlap
      const itemKeywords = extractKeywords(
        [scoredItem.item.title, scoredItem.item.abstract].filter(t => t).join(' '),
        { maxKeywords: 20 }
      );
      for (const keyword of itemKeywords) {
        if (selectedKeywords.has(keyword)) {
          matchCount++;
        }
      }

      // Apply penalty: reduce score by (diversityWeight * matchCount)
      const penalty = diversityWeight * matchCount * 10; // Scale penalty
      const newScore = Math.max(0, scoredItem.score - penalty);

      // Track this item's signals for future comparisons
      this.trackSignals(scoredItem.item, selectedAuthors, selectedKeywords);

      return {
        ...scoredItem,
        score: newScore
      };
    });

    // Re-sort after penalties
    return withPenalty.sort((a, b) => b.score - a.score);
  }

  /**
   * Track signals from an item (for diversity penalty)
   */
  private trackSignals(
    item: ZoteroItem,
    authorSet: Set<string>,
    keywordSet: Set<string>
  ): void {
    // Add authors
    for (const author of item.authors) {
      authorSet.add(author.toLowerCase());
    }

    // Add keywords
    const keywords = extractKeywords(
      [item.title, item.abstract].filter(t => t).join(' '),
      { maxKeywords: 20 }
    );
    for (const keyword of keywords) {
      keywordSet.add(keyword);
    }
  }

  /**
   * Normalize scores to 0-100 range
   * Call this after scoring all items in a batch
   *
   * @param scoredItems - Items with raw scores
   * @returns Items with normalized scores (0-100)
   */
  normalizeScores(scoredItems: ScoredItem[]): ScoredItem[] {
    if (scoredItems.length === 0) {
      return [];
    }

    // Find max score
    const maxScore = Math.max(...scoredItems.map(s => s.score));

    // Avoid division by zero
    if (maxScore === 0) {
      return scoredItems.map(s => ({ ...s, score: 0 }));
    }

    // Normalize to 0-100
    return scoredItems.map(s => ({
      ...s,
      score: (s.score / maxScore) * 100
    }));
  }
}
