/**
 * PreflightService - Orchestrates library health checks before onboarding
 *
 * Performs sequential checks for:
 * 1. Trash items (deletedItems table)
 * 2. Duplicate items (via DuplicateDetectionService)
 * 3. Group libraries (non-personal libraries)
 *
 * Each check includes error handling with graceful degradation.
 * Progress callbacks enable UI updates during execution.
 */

import { ZoteroConnector } from '../db/zotero-connector';
import { DuplicateDetectionService, DuplicateGroup } from './duplicate-detection-service';
import { TRASH_COUNT_QUERY, GROUP_LIBRARY_QUERY } from '../db/queries';

/**
 * Result of preflight health check
 */
export interface PreflightCheckResult {
  /** Number of items in trash (deletedItems) */
  trashCount: number;
  /** Error message if trash check failed */
  trashError?: string;

  /** Number of duplicate items detected */
  duplicateCount: number;
  /** Sample duplicate groups to show user */
  duplicateSampleGroups: DuplicateGroup[];
  /** Error message if duplicate detection failed */
  duplicateError?: string;

  /** Whether group libraries exist */
  hasGroupLibraries: boolean;
  /** Error message if group library check failed */
  groupLibrariesError?: string;
}

/**
 * Progress callback type
 * Called before each check with descriptive status message
 */
export type ProgressCallback = (message: string) => void;

/**
 * Service for orchestrating preflight health checks
 */
export class PreflightService {
  constructor(
    private connector: ZoteroConnector,
    private duplicateDetectionService: DuplicateDetectionService
  ) {}

  /**
   * Execute all preflight checks sequentially.
   *
   * Checks run in order: trash → duplicates → groups
   * Each check has error handling - errors populate result fields, don't throw.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns Promise with complete preflight check results
   */
  async executePreflightChecks(onProgress?: ProgressCallback): Promise<PreflightCheckResult> {
    const result: PreflightCheckResult = {
      trashCount: 0,
      duplicateCount: 0,
      duplicateSampleGroups: [],
      hasGroupLibraries: false
    };

    // Check 1: Trash items
    try {
      onProgress?.('Checking for trash...');
      result.trashCount = await this.getTrashCount();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Trash check failed:', errorMessage);
      result.trashError = errorMessage;
      result.trashCount = 0;
    }

    // Check 2: Duplicate items
    try {
      onProgress?.('Checking for duplicates...');
      const duplicateResult = await this.duplicateDetectionService.detectDuplicates();
      result.duplicateCount = duplicateResult.totalDuplicates;
      result.duplicateSampleGroups = duplicateResult.sampleGroups;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Duplicate detection failed:', errorMessage);
      result.duplicateError = errorMessage;
      result.duplicateCount = 0;
      result.duplicateSampleGroups = [];
    }

    // Check 3: Group libraries
    try {
      onProgress?.('Checking group libraries...');
      result.hasGroupLibraries = await this.hasGroupLibraries();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Group library check failed:', errorMessage);
      result.groupLibrariesError = errorMessage;
      result.hasGroupLibraries = false;
    }

    return result;
  }

  /**
   * Check if deletedItems table exists and count trash items.
   *
   * Zotero 6/7 compatibility: Check for table existence before querying.
   * If table doesn't exist, return 0 (no trash).
   *
   * @returns Number of items in trash for personal library
   */
  private async getTrashCount(): Promise<number> {
    if (!this.connector.isConnected) {
      throw new Error('Database not connected');
    }

    // Access db via type assertion (same pattern as DuplicateDetectionService)
    const db = (this.connector as any).db;
    if (!db) {
      throw new Error('Database not initialized');
    }

    // Check if deletedItems table exists (Zotero 6 vs 7 compatibility)
    const tableCheck = db.exec(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='deletedItems'
    `);

    if (!tableCheck || tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      console.log('deletedItems table not found (Zotero version compatibility)');
      return 0;
    }

    // Execute trash count query
    const results = db.exec(TRASH_COUNT_QUERY);

    if (!results || results.length === 0 || !results[0].values || results[0].values.length === 0) {
      return 0;
    }

    const count = results[0].values[0][0] as number;
    return count || 0;
  }

  /**
   * Check if group libraries exist in database.
   *
   * Group libraries have type != 'user'.
   * Returns false on error (assume no group libraries).
   *
   * @returns True if group libraries exist, false otherwise
   */
  private async hasGroupLibraries(): Promise<boolean> {
    if (!this.connector.isConnected) {
      throw new Error('Database not connected');
    }

    // Access db via type assertion
    const db = (this.connector as any).db;
    if (!db) {
      throw new Error('Database not initialized');
    }

    try {
      const results = db.exec(GROUP_LIBRARY_QUERY);

      if (!results || results.length === 0 || !results[0].values || results[0].values.length === 0) {
        return false;
      }

      const count = results[0].values[0][0] as number;
      return count > 0;
    } catch (err) {
      console.error('Group library check failed:', err);
      return false; // Assume no group libraries on error
    }
  }
}
