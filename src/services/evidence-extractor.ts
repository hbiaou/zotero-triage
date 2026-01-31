/**
 * Evidence Extraction Service
 *
 * Implements evidence hierarchy for AI enrichment:
 * 1. PDF fulltext (primary) - Extracted from Zotero's .zotero-ft-cache
 * 2. Zotero notes (secondary) - User annotations and highlights
 * 3. Abstract (tertiary) - Paper abstract from metadata
 * 4. Metadata only (insufficient) - No content available
 *
 * Determines what evidence is available for each item and returns
 * appropriate content for AI analysis.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ZoteroConnector } from '../db/zotero-connector';
import type { EvidenceLevel, EvidenceExtraction } from '../ai/types';
import type { ZoteroItem } from '../types';

/**
 * Minimum characters required for valid evidence
 * Content shorter than this is considered insufficient
 */
const MIN_EVIDENCE_LENGTH = 100;

/**
 * Warn if cache is older than this many days
 * Stale cache may indicate outdated PDF extraction
 */
const STALE_CACHE_DAYS = 30;

/**
 * Evidence extraction service
 *
 * Enforces evidence hierarchy to determine best available
 * content source for AI enrichment.
 */
export class EvidenceExtractor {
  private connector: ZoteroConnector;
  private zoteroDataPath: string;

  /**
   * Create evidence extractor
   * @param connector - ZoteroConnector instance for database queries
   * @param zoteroDataPath - Path to Zotero data directory
   */
  constructor(connector: ZoteroConnector, zoteroDataPath: string) {
    this.connector = connector;
    this.zoteroDataPath = zoteroDataPath;
  }

  /**
   * Extract PDF fulltext from Zotero cache
   *
   * Zotero indexes PDFs and stores plaintext in .zotero-ft-cache files.
   * This is the highest quality evidence source.
   *
   * @param itemKey - Zotero item key (8-character identifier)
   * @returns PDF fulltext or empty string if unavailable
   */
  private async extractPDFFulltext(itemKey: string): Promise<string> {
    try {
      // Locate storage directory for this item
      const storageDir = this.locateStorageDir(itemKey);
      if (!storageDir) {
        return '';
      }

      // Check for Zotero's fulltext cache file
      const cachePath = path.join(storageDir, '.zotero-ft-cache');
      if (!fs.existsSync(cachePath)) {
        return '';
      }

      // Read cached fulltext
      const content = await fs.promises.readFile(cachePath, 'utf-8');
      return content;
    } catch (err) {
      // Log error but don't throw - graceful degradation to next evidence level
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to extract PDF fulltext for ${itemKey}: ${errorMessage}`);
      return '';
    }
  }

  /**
   * Locate Zotero storage directory for an item
   *
   * @param itemKey - Zotero item key
   * @returns Storage directory path or null if doesn't exist
   */
  private locateStorageDir(itemKey: string): string | null {
    const storagePath = path.join(this.zoteroDataPath, 'storage', itemKey);

    if (fs.existsSync(storagePath) && fs.statSync(storagePath).isDirectory()) {
      return storagePath;
    }

    return null;
  }
}
