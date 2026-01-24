/**
 * ProfileInitializer - Creates user profile from seed papers
 *
 * Extracts signals (tags, authors, keywords) from selected seed papers
 * and initializes profile with frequency-based weighting.
 */

import type { ZoteroConnector } from '../db/zotero-connector';
import type { ProfileService } from './profile-service';
import type { UserProfile } from './types';
import { extractKeywordsFromMultiple } from './keyword-extractor';

/**
 * ProfileInitializer class for creating profiles from seed papers
 */
export class ProfileInitializer {
  private connector: ZoteroConnector;
  private profileService: ProfileService;
  private keywordExtractor: typeof extractKeywordsFromMultiple;

  /**
   * Create a new ProfileInitializer
   * @param connector - ZoteroConnector for fetching papers
   * @param profileService - ProfileService for persisting profiles
   * @param keywordExtractor - Function for extracting keywords
   */
  constructor(
    connector: ZoteroConnector,
    profileService: ProfileService,
    keywordExtractor: typeof extractKeywordsFromMultiple
  ) {
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
   * @param seedPaperIds - Array of Zotero item IDs to use as seeds
   * @param preferences - User preferences for recommendations
   * @returns Created profile
   */
  async initializeProfile(
    seedPaperIds: string[],
    preferences: { relevanceVsDiversity: number; recencyBoost: boolean }
  ): Promise<UserProfile> {
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

    // Create profile via ProfileService
    const profile = this.profileService.createProfile(
      seedPaperIds,
      preferences
    );

    // Update profile with extracted signals
    profile.tags = tags;
    profile.authors = authors;
    profile.keywords = keywords;

    // Persist the updated profile
    this.profileService.updateProfile(profile);

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
   * Extract signals from seed papers with frequency counting
   *
   * Returns signal -> frequency maps for tags, authors, and keywords
   */
  private extractSignalsWithFrequency(seedPapers: any[]): {
    tags: Map<string, number>;
    authors: Map<string, number>;
    keywords: Map<string, number>;
  } {
    const tagCounts = new Map<string, number>();
    const authorCounts = new Map<string, number>();
    const keywordCounts = new Map<string, number>();

    for (const paper of seedPapers) {
      // Extract tags
      if (paper.tags && Array.isArray(paper.tags)) {
        for (const tag of paper.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }

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

    // Convert counts to weights (frequency = weight)
    // Signal appearing in 1 paper = weight 1.0
    // Signal appearing in 5 papers = weight 5.0
    // etc.
    const tags = new Map<string, number>();
    for (const [tag, count] of tagCounts.entries()) {
      tags.set(tag, count);
    }

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
