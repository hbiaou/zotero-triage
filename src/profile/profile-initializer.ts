/**
 * ProfileInitializer - Creates user profile from seed papers
 *
 * Extracts signals (tags, authors, keywords) from selected seed papers
 * and initializes profile with frequency-based weighting.
 */

import { Notice, Plugin } from 'obsidian';
import type { ZoteroConnector } from '../db/zotero-connector';
import type { ProfileService } from './profile-service';
import type { UserProfile } from './types';
import { extractKeywordsFromMultiple } from './keyword-extractor';
import { normalizeTag, isNoiseTag } from '../utils/stemming';

/**
 * ProfileInitializer class for creating profiles from seed papers
 */
export class ProfileInitializer {
  private plugin: Plugin;
  private connector: ZoteroConnector;
  private profileService: ProfileService;
  private keywordExtractor: typeof extractKeywordsFromMultiple;

  /**
   * Create a new ProfileInitializer
   * @param plugin - Obsidian plugin instance for accessing settings
   * @param connector - ZoteroConnector for fetching papers
   * @param profileService - ProfileService for persisting profiles
   * @param keywordExtractor - Function for extracting keywords
   */
  constructor(
    plugin: Plugin,
    connector: ZoteroConnector,
    profileService: ProfileService,
    keywordExtractor: typeof extractKeywordsFromMultiple
  ) {
    this.plugin = plugin;
    this.connector = connector;
    this.profileService = profileService;
    this.keywordExtractor = keywordExtractor;
  }

  /**
   * Initialize profile from seed papers
   *
   * Algorithm:
   * 1. Fetch seed papers from connector
   * 2. Extract signals (tags, authors, keywords) from each paper
   * 3. Count frequency of each signal across all seeds
   * 4. Frequency becomes initial weight (appears in 5 papers = weight 5.0)
   * 5. Create and persist profile
   *
   * Preferences (relevanceVsDiversity, recencyBoost) are read from plugin settings.
   *
   * @param seedPaperIds - Array of Zotero item IDs to use as seeds
   * @returns Created profile
   */
  async initializeProfile(seedPaperIds: string[]): Promise<UserProfile> {
    // Step 1: Fetch seed papers
    const seedPapers = await this.fetchSeedPapers(seedPaperIds);

    if (seedPapers.length === 0) {
      console.warn('ProfileInitializer: No seed papers found');
    }

    // Step 2-3: Extract and count signals
    const signals = this.extractSignalsWithFrequency(seedPapers);

    // Step 4: Create profile with frequency-based weights
    const tags = new Map<string, number>(signals.tags);
    const authors = new Map<string, number>(signals.authors);
    const keywords = new Map<string, number>(signals.keywords);

    // Check if profile is empty (no signals extracted)
    if (tags.size === 0 && authors.size === 0 && keywords.size === 0) {
      new Notice(
        'Tip: Selected seed papers have minimal metadata. Add keywords, authors, or tags in Zotero to improve recommendations.',
        10000
      );
    }

    // Read preferences from plugin settings (source of truth)
    const pluginSettings = (this.plugin as any).settings;
    const preferences = {
      relevanceVsDiversity: pluginSettings.relevanceVsDiversity,
      recencyBoost: pluginSettings.recencyBoost
    };

    // Create profile via ProfileService
    const profile = this.profileService.createProfile(
      seedPaperIds,
      preferences
    );

    // Update profile with extracted signals
    profile.tags = tags;
    profile.authors = authors;
    profile.keywords = keywords;

    // Persist the updated profile immediately (critical operation)
    await this.profileService.updateProfileImmediate(profile);

    return profile;
  }

  /**
   * Fetch seed papers from connector
   * Handles missing items gracefully
   */
  private async fetchSeedPapers(seedPaperIds: string[]): Promise<any[]> {
    const papers = [];

    for (const idStr of seedPaperIds) {
      const itemID = parseInt(idStr, 10);
      const item = await this.connector.getItem(itemID);

      if (item) {
        papers.push(item);
      } else {
        console.warn(`ProfileInitializer: Seed paper not found: ${itemID}`);
      }
    }

    return papers;
  }

  /**
   * Build tag profile from seed papers with top-20 frequency weighting
   *
   * Algorithm:
   * 1. Collect all tags from seed papers
   * 2. Normalize each tag using normalizeTag() (lowercase + stemming)
   * 3. Skip empty strings and noise tags (workflow + annotation tags)
   * 4. Count frequency (Map<normalized_tag, count>)
   * 5. Filter by minimum frequency (1), sort descending, take top 20
   * 6. Use frequency directly as weight (appears in 3 papers = weight 3.0)
   *
   * @param seedPapers - Zotero items to extract tags from
   * @param topN - Number of top tags to include (default: 20)
   * @param minFrequency - Minimum appearances required (default: 1)
   * @returns Map<string, number> for profile.tags
   */
  private buildTagProfile(
    seedPapers: any[],
    topN: number = 20,
    minFrequency: number = 1
  ): Map<string, number> {
    const tagFrequency = new Map<string, number>();

    for (const paper of seedPapers) {
      if (!paper.tags || !Array.isArray(paper.tags)) {
        continue; // Skip items without tags
      }

      for (const tag of paper.tags) {
        // Defensive: verify tag is non-empty string
        if (typeof tag !== 'string' || tag.trim().length === 0) {
          continue;
        }

        // Normalize tag (lowercase + stemming)
        const normalized = normalizeTag(tag);
        if (normalized.length === 0) {
          continue;
        }

        // Skip noise tags (workflow metadata + annotation tags)
        if (isNoiseTag(normalized)) {
          continue;
        }

        // Count frequency
        tagFrequency.set(normalized, (tagFrequency.get(normalized) || 0) + 1);
      }
    }

    // Filter by minimum frequency, sort by frequency descending, take top N
    const topTags = Array.from(tagFrequency.entries())
      .filter(([_, freq]) => freq >= minFrequency)
      .sort((a, b) => b[1] - a[1])  // Sort by frequency descending
      .slice(0, topN);

    // Convert frequency to weight map
    // Frequency directly becomes weight (3 appearances = weight 3.0)
    const profileTags = new Map<string, number>();
    for (const [tag, freq] of topTags) {
      profileTags.set(tag, freq);
    }

    return profileTags;
  }

  /**
   * Extract signals from seed papers with frequency counting
   *
   * Returns signal -> frequency maps for tags, authors, and keywords
   */
  private extractSignalsWithFrequency(seedPapers: any[]): {
    tags: Map<string, number>;
    authors: Map<string, number>;
    keywords: Map<string, number>;
  } {
    const authorCounts = new Map<string, number>();
    const keywordCounts = new Map<string, number>();

    for (const paper of seedPapers) {
      // Extract authors
      if (paper.authors && Array.isArray(paper.authors)) {
        for (const author of paper.authors) {
          authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
        }
      }

      // Extract keywords from title + abstract
      const texts = [paper.title, paper.abstract];
      const extractedKeywords = this.keywordExtractor(texts, {
        minLength: 4,
        maxKeywords: 20 // Extract 20 keywords per paper
      });

      for (const keyword of extractedKeywords) {
        keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
      }
    }

    // Build tag profile using specialized method (top 20 with stemming + noise filtering)
    const tags = this.buildTagProfile(seedPapers, 20, 1);

    // Convert counts to weights (frequency = weight)
    // Signal appearing in 1 paper = weight 1.0
    // Signal appearing in 5 papers = weight 5.0
    // etc.
    const authors = new Map<string, number>();
    for (const [author, count] of authorCounts.entries()) {
      authors.set(author, count);
    }

    const keywords = new Map<string, number>();
    for (const [keyword, count] of keywordCounts.entries()) {
      keywords.set(keyword, count);
    }

    return { tags, authors, keywords };
  }
}
