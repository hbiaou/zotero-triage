/**
 * Profile Types - User research interest profile data structures
 *
 * Defines types for storing and managing user preferences, signals (tags, authors, keywords),
 * and configuration for personalized recommendations.
 */

/**
 * User profile storing research interests and recommendation preferences
 * Persists across Obsidian restarts via plugin settings
 */
export interface UserProfile {
  /** Tag -> weight mapping (user-created tags from Zotero items, annotation tags filtered) */
  tags: Map<string, number>;

  /** Author -> weight mapping (author names) */
  authors: Map<string, number>;

  /** Keyword -> weight mapping (extracted from titles/abstracts) */
  keywords: Map<string, number>;

  /** Zotero item IDs used as seed papers for profile initialization */
  seedPaperIds: string[];

  /**
   * Recommendation balance (0-1)
   * 0 = pure relevance (highest scored items)
   * 1 = maximum diversity (balanced across signal types)
   */
  relevanceVsDiversity: number;

  /** Whether to boost recent publications in recommendations */
  recencyBoost: boolean;

  /** Timestamp when profile was created */
  createdAt: number;

  /** Timestamp when profile was last updated */
  updatedAt: number;
}

/**
 * Individual signal (tag, author, or keyword) with metadata
 * Used for tracking how signals were added to profile
 */
export interface ProfileSignal {
  /** Type of signal */
  type: 'tag' | 'author' | 'keyword';

  /** Signal value (tag name, author name, or keyword) */
  value: string;

  /** Weight/importance of this signal (0+, higher = more important) */
  weight: number;

  /** How this signal was added to the profile */
  source: 'seed' | 'accept' | 'reject';
}

/**
 * Weight multipliers for different signal types
 * Applied when scoring items for recommendations
 */
export interface ProfileWeights {
  /** Multiplier for tag matches (default 1.0) */
  tagWeight: number;

  /** Multiplier for author matches (default 0.8) */
  authorWeight: number;

  /** Multiplier for keyword matches (default 0.5) */
  keywordWeight: number;
}

/**
 * Default weight multipliers
 * Tags are most important, then authors, then keywords
 */
export const DEFAULT_PROFILE_WEIGHTS: ProfileWeights = {
  tagWeight: 1.0,
  authorWeight: 0.8,
  keywordWeight: 0.5
};
