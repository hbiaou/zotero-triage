/**
 * Zotero Triage Core Type Definitions
 *
 * Defines interfaces for plugin settings, Zotero items, and the processing registry.
 */

import type { QualityGateConfig } from './validation/types';
import type { UserProfile } from './profile/types';

/**
 * Plugin settings stored in data.json
 */
export interface ZoteroTriageSettings {
  /** Path to the Zotero SQLite database file */
  zoteroDbPath: string;
  /** Output folder for literature notes (relative to vault root) */
  outputFolder: string;
  /** Number of items per batch (1-20, default: 5) */
  batchSize: number;
  /** Quality gate validation configuration */
  qualityGate: QualityGateConfig;
  /** User profile for personalized recommendations (null if not configured) */
  userProfile: UserProfile | null;
  /**
   * Tag weight multiplier for recommendation scoring (0.0-3.0)
   * Default: 1.5 (between keywords and authors)
   * 0.0 = disable tag scoring, 3.0 = strong tag preference
   */
  tagWeight: number;
  /**
   * Relevance vs Diversity balance (0-1)
   * 0 = pure relevance (highest scored items)
   * 1 = maximum diversity (balanced across signal types)
   */
  relevanceVsDiversity: number;
  /** Whether to boost recent publications in recommendations */
  recencyBoost: boolean;
  /**
   * Library filter mode
   * 'personal' = user library only (excludes group libraries, feeds)
   * 'all' = all libraries (user + groups)
   */
  libraryFilterMode: 'personal' | 'all';
}

import { DEFAULT_QUALITY_GATE_CONFIG } from './validation/types';

/**
 * Default settings applied on first plugin load
 */
export const DEFAULT_SETTINGS: ZoteroTriageSettings = {
  zoteroDbPath: '',
  outputFolder: '10_Literature',
  batchSize: 5,
  qualityGate: DEFAULT_QUALITY_GATE_CONFIG,
  userProfile: null,
  tagWeight: 1.5,  // Default from CONTEXT.md decision
  relevanceVsDiversity: 0,  // Pure relevance by default
  recencyBoost: true,  // Boost recent publications
  libraryFilterMode: 'personal'  // User library only
};

/**
 * Represents a single item from the Zotero database
 */
export interface ZoteroItem {
  /** Zotero internal item ID */
  itemID: number;
  /** Zotero item key (used in URIs like zotero://select/items/0_KEY) */
  itemKey: string;
  /** Item title */
  title: string;
  /** List of authors in "Last, First" format */
  authors: string[];
  /** Publication year (extracted from date field) */
  year: string | null;
  /** Digital Object Identifier */
  doi: string | null;
  /** Journal/publication title */
  journal: string | null;
  /** Volume number */
  volume: string | null;
  /** Page range */
  pages: string | null;
  /** Abstract text */
  abstract: string | null;
  /** Publisher name (for books, reports, etc.) */
  publisher: string | null;
  /** ISBN identifier (for books) */
  isbn: string | null;
  /** URL (for web pages, video recordings, etc.) */
  url: string | null;
  /** Path to attached PDF file */
  pdfPath: string | null;
  /** Zotero item type (journalArticle, book, etc.) */
  itemType: string;
  /** ISO date when item was added to Zotero */
  dateAdded: string;
}

/**
 * Processing state for a single Zotero item
 */
export type RegistryState = 'unseen' | 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'imported';

/**
 * Registry entry tracking the state of a Zotero item
 */
export interface RegistryEntry {
  /** Current processing state */
  state: RegistryState;
  /** Unix timestamp of last state change */
  timestamp: number;
}

/**
 * Processing registry stored in plugin data
 * Tracks which items have been seen, proposed, accepted, rejected, or imported
 */
export interface Registry {
  /** Schema version for future migrations */
  version: number;
  /** Map of Zotero itemID (as string) to registry entry */
  entries: Record<string, RegistryEntry>;
  /** Unix timestamp of last modification */
  lastModified: number;
}
