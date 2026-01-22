/**
 * Zotero schema version detection and validation
 *
 * Zotero's database schema version changes between major releases.
 * This module provides constants and types for schema version checking.
 */

/**
 * Supported Zotero schema version range
 * - min: Zotero 6.x baseline
 * - max: Zotero 7.x estimated upper bound
 */
export const SUPPORTED_SCHEMA_VERSIONS = {
  min: 100,
  max: 200
} as const;

/**
 * Result of schema version check against supported range
 */
export interface SchemaCheckResult {
  /** Whether the schema version is within supported range */
  supported: boolean;
  /** Detected schema version number */
  version: number;
  /** Human-readable status message */
  message: string;
}

/**
 * Zotero item types that represent actual library items (not attachments/notes)
 */
export const LIBRARY_ITEM_TYPES = [
  'journalArticle',
  'book',
  'bookSection',
  'conferencePaper',
  'thesis',
  'report',
  'webpage',
  'preprint',
  'manuscript',
  'patent',
  'presentation',
  'document'
] as const;

export type LibraryItemType = typeof LIBRARY_ITEM_TYPES[number];
