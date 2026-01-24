/**
 * Recommendation Engine Types
 *
 * Defines data structures for intelligent recommendation scoring, including:
 * - ScoredItem: Items with computed relevance scores
 * - RecommendationConfig: Configuration for scoring algorithm
 * - MatchedSignal: Individual signal matches for transparency
 */

import type { ZoteroItem } from '../types';

/**
 * Zotero item with computed recommendation score and breakdown
 * Used to rank items for profile-aware batch generation
 */
export interface ScoredItem {
  /** The Zotero item being scored */
  item: ZoteroItem;

  /** Final recommendation score (0-100, normalized) */
  score: number;

  /** Breakdown of score components for debugging/transparency */
  scoreBreakdown: {
    /** Points from matching tags */
    tagScore: number;
    /** Points from matching authors */
    authorScore: number;
    /** Points from matching keywords (extracted from title/abstract) */
    keywordScore: number;
    /** Recency boost multiplier applied (1.0 = no boost) */
    recencyBoost: number;
  };
}

/**
 * Configuration for recommendation scoring algorithm
 * Controls relevance vs diversity tradeoff, recency boosting, etc.
 */
export interface RecommendationConfig {
  /**
   * Balance between relevance and diversity (0-1)
   * - 0 = pure relevance (highest scored items, may be similar)
   * - 1 = maximum diversity (balanced across different topics)
   * Default: 0 (pure relevance for MVP)
   */
  relevanceVsDiversity: number;

  /** Whether to boost recent publications */
  recencyBoost: boolean;

  /**
   * Time window for recency boost (in years)
   * Papers published within this window get boosted
   * Default: 3 years
   */
  recencyYears: number;

  /**
   * Multiplier for items within recency window
   * Default: 1.5 (50% boost for recent papers)
   */
  recencyMultiplier: number;
}

/**
 * Individual signal match (tag, author, or keyword)
 * Used for tracking which signals contributed to an item's score
 */
export interface MatchedSignal {
  /** Type of signal matched */
  type: 'tag' | 'author' | 'keyword';

  /** The specific value that matched (tag name, author name, keyword) */
  value: string;

  /** Weight of this signal from the user profile */
  weight: number;
}
