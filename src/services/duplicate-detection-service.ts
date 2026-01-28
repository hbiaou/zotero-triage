/**
 * DuplicateDetectionService - Detects duplicate items in personal library
 *
 * Uses DOI-first hierarchy for matching:
 * 1. DOI match (most reliable)
 * 2. ISBN match for books
 * 3. Normalized title match (exact after normalization)
 *
 * Operates on Phase 9 filtered item set (personal library only).
 * Returns total duplicate count and sample groups for UI display.
 */

import { ZoteroConnector } from '../db/zotero-connector';
import { DUPLICATES_QUERY } from '../db/queries';

/**
 * Represents a single item within a duplicate group
 */
export interface DuplicateGroup {
  /** Database item ID */
  itemID: number;
  /** Zotero item key (8-char identifier) */
  itemKey: string;
  /** Item type (journalArticle, book, etc.) */
  itemType: string;
  /** Item title */
  title: string | null;
  /** Number of items in this duplicate group */
  duplicateCount: number;
}

/**
 * Service for detecting duplicate items across personal library
 */
export class DuplicateDetectionService {
  constructor(private connector: ZoteroConnector) {}

  /**
   * Detect duplicates across personal library.
   * Returns total count and sample duplicate groups.
   *
   * Performance: Designed for <30 seconds on 5000+ items.
   * Graceful degradation: Returns 0 duplicates on error.
   *
   * @returns Promise with totalDuplicates count and sampleGroups array
   */
  async detectDuplicates(): Promise<{
    totalDuplicates: number;
    sampleGroups: DuplicateGroup[];
  }> {
    try {
      // Ensure database connection (connector manages this internally)
      if (!this.connector.isConnected) {
        throw new Error('Database not connected. Call connect() first.');
      }

      // Access private db property via type assertion (ZoteroConnector owns the service pattern)
      const db = (this.connector as any).db;
      if (!db) {
        throw new Error('Database not initialized');
      }

      // Execute duplicate detection query
      const results = db.exec(DUPLICATES_QUERY);

      if (!results || results.length === 0) {
        return { totalDuplicates: 0, sampleGroups: [] };
      }

      const [result] = results;
      if (!result.values || result.values.length === 0) {
        return { totalDuplicates: 0, sampleGroups: [] };
      }

      // Parse results into DuplicateGroup objects
      const columns = result.columns;
      const duplicates: DuplicateGroup[] = result.values.map((row: any[]) => ({
        itemID: row[columns.indexOf('itemID')] as number,
        itemKey: row[columns.indexOf('itemKey')] as string,
        itemType: row[columns.indexOf('itemType')] as string,
        title: row[columns.indexOf('title')] as string | null,
        duplicateCount: row[columns.indexOf('duplicate_count')] as number
      }));

      // Total count = number of items involved in duplicates
      const totalDuplicates = duplicates.length;

      // Sample first 3 groups to show user
      const sampleGroups = duplicates.slice(0, 3);

      return { totalDuplicates, sampleGroups };
    } catch (err) {
      console.error('Duplicate detection failed:', err);
      // Graceful degradation: return 0 duplicates instead of crashing
      return { totalDuplicates: 0, sampleGroups: [] };
    }
  }

  /**
   * Generate deep link to Zotero for viewing duplicates.
   *
   * Note: There is no direct zotero:// URI to the "Duplicate Items" collection.
   * This returns a basic zotero:// URI that opens Zotero's main window.
   * Users must then right-click their library and select "Show Duplicates".
   *
   * @returns zotero:// URI string
   */
  generateDuplicatesDeepLink(): string {
    // Opens Zotero main window
    // User must manually navigate: right-click library → "Show Duplicates"
    return 'zotero://';
  }
}
