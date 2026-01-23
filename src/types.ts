/**
 * ZotBridge Core Type Definitions
 *
 * Defines interfaces for plugin settings, Zotero items, and the processing registry.
 */

/**
 * Plugin settings stored in data.json
 */
export interface ZotBridgeSettings {
  /** Path to the Zotero SQLite database file */
  zoteroDbPath: string;
  /** Output folder for literature notes (relative to vault root) */
  outputFolder: string;
}

/**
 * Default settings applied on first plugin load
 */
export const DEFAULT_SETTINGS: ZotBridgeSettings = {
  zoteroDbPath: '',
  outputFolder: '10_Literature'
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
