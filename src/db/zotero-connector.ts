/**
 * ZoteroConnector - SQLite database connector for Zotero using sql.js
 *
 * Provides read-only access to Zotero's local SQLite database.
 * Uses sql.js (WebAssembly) to avoid native module issues in Obsidian's Electron.
 *
 * Usage:
 *   const connector = new ZoteroConnector(pluginDir);
 *   await connector.connect('/path/to/zotero.sqlite');
 *   const items = await connector.loadItems();
 *   connector.close();
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  VERSION_QUERY,
  ITEMS_QUERY,
  CREATORS_QUERY,
  ATTACHMENTS_QUERY,
  ITEM_TAGS_QUERY,
  ITEM_COLLECTIONS_QUERY,
  ITEM_COUNT_QUERY,
  LIBRARY_STATS_QUERY,
  formatCreator,
  parseYear,
  CreatorRow
} from './queries';
import { SUPPORTED_SCHEMA_VERSIONS, SchemaCheckResult } from './schema';
import { processInChunks } from '../utils/async';
import { getZoteroDataDir, resolvePdfPath } from '../utils/paths';
import { retryWithBackoff } from './retry-handler';
import { DuplicateDetectionService, DuplicateGroup } from '../services/duplicate-detection-service';

/**
 * Zotero item with metadata extracted from the EAV schema
 */
export interface ZoteroItem {
  /** Unique item ID in database */
  itemID: number;
  /** Zotero item key (8-char identifier) */
  itemKey: string;
  /** Item title */
  title: string;
  /** List of authors (formatted strings) */
  authors: string[];
  /** Publication year (4-digit string) */
  year: string;
  /** DOI identifier (if available) */
  doi: string | null;
  /** Journal/publication name */
  journal: string | null;
  /** Volume number */
  volume: string | null;
  /** Issue number */
  issue: string | null;
  /** Page range */
  pages: string | null;
  /** Abstract text */
  abstract: string | null;
  /** Publisher name (for books, reports, etc.) */
  publisher: string | null;
  /** ISBN identifier (for books) */
  isbn: string | null;
  /** Full path to attached PDF (if available) */
  pdfPath: string | null;
  /** Item type (journalArticle, book, etc.) */
  itemType: string;
  /** Tags assigned to item */
  tags: string[];
  /** Collections item belongs to */
  collections: string[];
  /** Date added to Zotero */
  dateAdded: string;
  /** Date last modified */
  dateModified: string;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  /** Whether connection succeeded */
  success: boolean;
  /** Number of items in database (excluding attachments/notes) */
  itemCount: number;
  /** Detected schema version */
  schemaVersion: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Progress callback for item loading
 */
export type LoadProgressCallback = (loaded: number, total: number) => void;

/**
 * ZoteroConnector class for SQLite database access via sql.js
 */
export class ZoteroConnector {
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private pluginDir: string;
  private items: ZoteroItem[] = [];
  private isLoaded: boolean = false;
  private dbPath: string | null = null;

  /**
   * Create a new ZoteroConnector
   * @param pluginDir - Plugin directory containing sql-wasm.wasm file
   */
  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
  }

  /**
   * Initialize sql.js by loading the WASM binary.
   * Called automatically on first connect if not already initialized.
   */
  async initialize(): Promise<void> {
    if (this.SQL) return;

    const wasmPath = path.join(this.pluginDir, 'sql-wasm.wasm');

    if (!fs.existsSync(wasmPath)) {
      throw new Error(
        `sql-wasm.wasm not found at ${wasmPath}. ` +
        'Please ensure the WASM file is in the plugin directory.'
      );
    }

    const wasmBinary = fs.readFileSync(wasmPath);

    this.SQL = await initSqlJs({
      wasmBinary: wasmBinary
    });
  }

  /**
   * Connect to a Zotero SQLite database.
   * @param dbPath - Full path to zotero.sqlite file
   * @throws Error if database doesn't exist, can't be read, or has unsupported schema
   */
  async connect(dbPath: string): Promise<void> {
    return await retryWithBackoff(async () => {
      if (!this.SQL) {
        await this.initialize();
      }

      if (!fs.existsSync(dbPath)) {
        throw new Error(`Zotero database not found at: ${dbPath}`);
      }

      // Read database file into memory (sql.js operates on in-memory copy)
      const dbBuffer = fs.readFileSync(dbPath);
      this.db = new this.SQL!.Database(new Uint8Array(dbBuffer));
      this.dbPath = dbPath;

      // Verify schema version is supported
      const schemaCheck = await this.checkSchemaVersion();
      if (!schemaCheck.supported) {
        this.close();
        throw new Error(schemaCheck.message);
      }

      // Validate tag schema (non-blocking)
      const tagSchemaCheck = await this.validateTagSchema();
      if (!tagSchemaCheck.valid) {
        console.warn('Tag schema validation issues:', tagSchemaCheck.issues);
        // Continue anyway - tags are optional enhancement
      }

      // Validate library filtering schema (non-blocking)
      const librarySchemaCheck = await this.validateLibraryFilterSchema();
      if (!librarySchemaCheck.valid) {
        console.warn('Library filter schema validation issues:', librarySchemaCheck.issues);
        // Continue anyway - will handle missing tables in queries
      }
      if (!librarySchemaCheck.hasRetractedItems) {
        console.info('Zotero 6.x detected - retracted items filtering unavailable');
      }

      // Clear cached items on new connection
      this.items = [];
      this.isLoaded = false;
    }, {
      maxAttempts: 5,
      initialDelayMs: 100
    });
  }

  /**
   * Check if the database schema version is supported.
   * @returns Schema check result with version number and support status
   */
  async checkSchemaVersion(): Promise<SchemaCheckResult> {
    if (!this.db) {
      return {
        supported: false,
        version: 0,
        message: 'Database not connected'
      };
    }

    try {
      const result = this.db.exec(VERSION_QUERY);

      if (result.length === 0 || result[0].values.length === 0) {
        return {
          supported: false,
          version: 0,
          message: 'Could not determine Zotero schema version. Database may be corrupted.'
        };
      }

      const version = parseInt(String(result[0].values[0][0]), 10);

      if (isNaN(version)) {
        return {
          supported: false,
          version: 0,
          message: 'Invalid schema version format in database.'
        };
      }

      if (version < SUPPORTED_SCHEMA_VERSIONS.min) {
        return {
          supported: false,
          version,
          message: `Zotero schema version ${version} is too old (minimum: ${SUPPORTED_SCHEMA_VERSIONS.min}). Please upgrade Zotero.`
        };
      }

      if (version > SUPPORTED_SCHEMA_VERSIONS.max) {
        return {
          supported: false,
          version,
          message: `Zotero schema version ${version} is newer than supported (maximum: ${SUPPORTED_SCHEMA_VERSIONS.max}). Please update Zotero Triage plugin.`
        };
      }

      return {
        supported: true,
        version,
        message: `Schema version ${version} supported.`
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        supported: false,
        version: 0,
        message: `Error reading schema version: ${errorMessage}`
      };
    }
  }

  /**
   * Validate tag schema integrity in database.
   * Checks for itemTags and tags tables existence.
   * Tags are optional - validation failure doesn't block connection.
   *
   * @returns Schema validation result with issues list
   */
  async validateTagSchema(): Promise<{ valid: boolean; issues: string[] }> {
    if (!this.db) {
      return {
        valid: false,
        issues: ['Database not connected']
      };
    }

    const issues: string[] = [];

    try {
      // Check if itemTags table exists
      const itemTagsResult = this.db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='itemTags'"
      );
      if (itemTagsResult.length === 0 || itemTagsResult[0].values.length === 0) {
        issues.push('itemTags table not found');
      }

      // Check if tags table exists
      const tagsResult = this.db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tags'"
      );
      if (tagsResult.length === 0 || tagsResult[0].values.length === 0) {
        issues.push('tags table not found');
      }

      return { valid: issues.length === 0, issues };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`Could not validate tag schema: ${errorMessage}`);
      return {
        valid: false,
        issues: [`Schema validation failed: ${errorMessage}`]
      };
    }
  }

  /**
   * Validate that schema supports library filtering.
   * Checks for libraries table (required) and retractedItems table (optional, Zotero 7.0+).
   *
   * @returns Validation result with retractedItems availability flag
   */
  async validateLibraryFilterSchema(): Promise<{
    valid: boolean;
    hasRetractedItems: boolean;
    issues: string[];
  }> {
    if (!this.db) {
      return {
        valid: false,
        hasRetractedItems: false,
        issues: ['Database not connected']
      };
    }

    const issues: string[] = [];

    try {
      // Check libraries table exists (required)
      const librariesCheck = this.db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='libraries'"
      );
      if (librariesCheck.length === 0 || librariesCheck[0].values.length === 0) {
        issues.push('libraries table not found - schema may be corrupted');
      }

      // Check retractedItems table exists (optional, Zotero 7.0+)
      const retractedCheck = this.db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='retractedItems'"
      );
      const hasRetractedItems = retractedCheck.length > 0 && retractedCheck[0].values.length > 0;

      if (!hasRetractedItems) {
        console.info('retractedItems table not found - assuming Zotero 6.x (graceful degradation)');
      }

      return {
        valid: issues.length === 0,
        hasRetractedItems,
        issues
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Library filter schema validation failed:', errorMessage);
      return {
        valid: false,
        hasRetractedItems: false,
        issues: [`Schema validation failed: ${errorMessage}`]
      };
    }
  }

  /**
   * Load all items from the database with their creators, attachments, and tags.
   * Uses chunked processing to avoid blocking the UI thread.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns Array of ZoteroItem objects
   */
  async loadItems(onProgress?: LoadProgressCallback): Promise<ZoteroItem[]> {
    return await retryWithBackoff(async () => {
      if (!this.db || !this.dbPath) {
        throw new Error('Database not connected. Call connect() first.');
      }

      // Get total count for progress reporting
      const countResult = this.db.exec(ITEM_COUNT_QUERY);
      const totalItems = countResult[0]?.values[0]?.[0] as number || 0;

      // Check for empty personal library
      if (totalItems === 0) {
        throw new Error(
          'No items found in your personal Zotero library. ' +
          'This plugin only works with personal library items (not group libraries or feeds). ' +
          'If you have items in Zotero, they may be in group libraries or trash. ' +
          'Please ensure you have items in your personal library before using this plugin.'
        );
      }

      // Call progress callback initially
      if (onProgress) {
        onProgress(0, totalItems);
      }

      // Execute main items query
      const itemsResult = this.db.exec(ITEMS_QUERY);
      if (itemsResult.length === 0) {
        this.items = [];
        this.isLoaded = true;
        return this.items;
      }

      const columns = itemsResult[0].columns;
      const rows = itemsResult[0].values;

      // Get column indices
      const colIndex = {
        itemID: columns.indexOf('itemID'),
        itemKey: columns.indexOf('itemKey'),
        dateAdded: columns.indexOf('dateAdded'),
        dateModified: columns.indexOf('dateModified'),
        itemType: columns.indexOf('itemType'),
        title: columns.indexOf('title'),
        doi: columns.indexOf('doi'),
        date: columns.indexOf('date'),
        journal: columns.indexOf('journal'),
        volume: columns.indexOf('volume'),
        issue: columns.indexOf('issue'),
        pages: columns.indexOf('pages'),
        abstract: columns.indexOf('abstract'),
        publisher: columns.indexOf('publisher'),
        isbn: columns.indexOf('isbn')
      };

      const dataDir = getZoteroDataDir(this.dbPath);
      const items: ZoteroItem[] = [];
      let loadedCount = 0;

      // Process items in chunks to avoid UI blocking
      await processInChunks(
        rows,
        async (row) => {
          const itemID = row[colIndex.itemID] as number;
          const itemKey = row[colIndex.itemKey] as string;
          const itemType = row[colIndex.itemType] as string;
          const title = (row[colIndex.title] as string) || 'Untitled';

          // Get creators for this item
          const creatorsResult = this.db!.exec(CREATORS_QUERY, [itemID]);
          const authors: string[] = [];

          // DEBUG (Quick task 007): Diagnostic for specific problematic items
          if (itemID === 61359 || (itemType === 'videoRecording' && title.includes('Clawdbot'))) {
            console.log(`[Quick-007 DIAGNOSTIC] itemID: ${itemID}, title: "${title}"`);
            console.log(`  creatorsResult.length: ${creatorsResult.length}`);
            if (creatorsResult.length > 0) {
              console.log(`  creatorsResult[0].columns:`, creatorsResult[0].columns);
              console.log(`  creatorsResult[0].values.length: ${creatorsResult[0].values.length}`);
              console.log(`  All values:`, creatorsResult[0].values);
            }
          }

          if (creatorsResult.length > 0) {
            const creatorCols = creatorsResult[0].columns;
            for (const creatorRow of creatorsResult[0].values) {
              const creator: CreatorRow = {
                firstName: creatorRow[creatorCols.indexOf('firstName')] as string | null,
                lastName: creatorRow[creatorCols.indexOf('lastName')] as string,
                fieldMode: creatorRow[creatorCols.indexOf('fieldMode')] as number,
                creatorType: creatorRow[creatorCols.indexOf('creatorType')] as string,
                orderIndex: creatorRow[creatorCols.indexOf('orderIndex')] as number
              };

              // DEBUG: Log creator details for problematic items
              if (itemID === 61359 || (itemType === 'videoRecording' && title.includes('Clawdbot'))) {
                console.log(`  Creator parsed:`, creator);
              }

              // Quick task 007: Include all primary creator types
              // - Standard academic: author, editor
              // - Video recordings: director, presenter, producer, castMember, contributor, scriptwriter, guest
              // For video items, we're inclusive to capture YouTube channels, podcasters, etc.
              const includedTypes = [
                'author', 'editor',                                    // Academic papers, books
                'director', 'presenter', 'producer', 'contributor',    // Video recordings
                'castMember', 'scriptwriter', 'guest', 'podcaster',   // Media content
                'interviewee', 'interviewer'                           // Interviews
              ];

              if (includedTypes.includes(creator.creatorType)) {
                authors.push(formatCreator(creator));
              } else {
                // DEBUG: Log when creator type is NOT included
                if (itemID === 61359 || (itemType === 'videoRecording' && title.includes('Clawdbot'))) {
                  console.log(`  ⚠️ Creator type "${creator.creatorType}" NOT in includedTypes list!`);
                }
              }
            }
          }

          // Get PDF attachment for this item
          const attachResult = this.db!.exec(ATTACHMENTS_QUERY, [itemID]);
          let pdfPath: string | null = null;
          if (attachResult.length > 0 && attachResult[0].values.length > 0) {
            const attachCols = attachResult[0].columns;
            const attachRow = attachResult[0].values[0];
            const attachmentPath = attachRow[attachCols.indexOf('path')] as string | null;
            if (attachmentPath) {
              pdfPath = resolvePdfPath(attachmentPath, dataDir, itemKey);
            }
          }

          // Get tags for this item
          const tags: string[] = [];
          try {
            const tagsResult = this.db!.exec(ITEM_TAGS_QUERY, [itemID]);

            // Defensive check: ensure result exists and has values
            if (tagsResult && tagsResult.length > 0 && tagsResult[0].values && tagsResult[0].values.length > 0) {
              for (const tagRow of tagsResult[0].values) {
                // Check if tagRow is valid and has a value
                if (tagRow && Array.isArray(tagRow) && tagRow[0] != null) {
                  const tagValue = tagRow[0];
                  // Ensure it's a string
                  if (typeof tagValue === 'string') {
                    const normalized = tagValue.trim();
                    // Only add non-empty tags
                    if (normalized.length > 0) {
                      tags.push(normalized);
                    }
                  } else {
                    console.warn(`Tag value for item ${itemID} is not a string, skipping:`, tagValue);
                  }
                } else {
                  console.debug(`Tag row null for item ${itemID}, skipping`);
                }
              }
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`Failed to extract tags for item ${itemID}: ${errorMessage}`);
            // Return empty array on error (graceful degradation)
          }

          // Get collections for this item
          const collectionsResult = this.db!.exec(ITEM_COLLECTIONS_QUERY, [itemID]);
          const collections: string[] = [];
          if (collectionsResult.length > 0) {
            for (const collectionRow of collectionsResult[0].values) {
              collections.push(collectionRow[0] as string);
            }
          }

          const item: ZoteroItem = {
            itemID,
            itemKey,
            title: (row[colIndex.title] as string) || 'Untitled',
            authors,
            year: parseYear(row[colIndex.date] as string | null),
            doi: row[colIndex.doi] as string | null,
            journal: row[colIndex.journal] as string | null,
            volume: row[colIndex.volume] as string | null,
            issue: row[colIndex.issue] as string | null,
            pages: row[colIndex.pages] as string | null,
            abstract: row[colIndex.abstract] as string | null,
            publisher: row[colIndex.publisher] as string | null,
            isbn: row[colIndex.isbn] as string | null,
            pdfPath,
            itemType: row[colIndex.itemType] as string,
            tags,
            collections,
            dateAdded: row[colIndex.dateAdded] as string,
            dateModified: row[colIndex.dateModified] as string
          };

          items.push(item);
          loadedCount++;

          if (onProgress) {
            onProgress(loadedCount, totalItems);
          }
        },
        50 // Process 50 items per chunk
      );

      this.items = items;
      this.isLoaded = true;
      return this.items;
    }, {
      maxAttempts: 5,
      initialDelayMs: 100
    });
  }

  /**
   * Get a single item by ID.
   * Returns from cache if items are loaded, otherwise queries the database.
   *
   * @param itemID - Database item ID
   * @returns ZoteroItem or null if not found
   */
  async getItem(itemID: number): Promise<ZoteroItem | null> {
    // Check cache first
    if (this.isLoaded) {
      return this.items.find(item => item.itemID === itemID) || null;
    }

    // Query single item (not using cache)
    if (!this.db || !this.dbPath) {
      throw new Error('Database not connected. Call connect() first.');
    }

    // For single item lookup, query directly
    const singleItemQuery = ITEMS_QUERY.replace(
      'ORDER BY dateAdded DESC',
      `HAVING itemID = ${itemID}`
    );

    const result = this.db.exec(singleItemQuery);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    // This is a simplified implementation - for a single item
    // we could optimize further but this works
    const tempItems = await this.loadItems();
    return tempItems.find(item => item.itemID === itemID) || null;
  }

  /**
   * Get all cached items (requires loadItems to have been called)
   * @returns Array of cached items, or empty array if not loaded
   */
  getCachedItems(): ZoteroItem[] {
    return this.items;
  }

  /**
   * Check if items have been loaded into cache
   */
  get itemsLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Get the count of cached items
   */
  get itemCount(): number {
    return this.items.length;
  }

  /**
   * Detect duplicate items across personal library.
   * Uses DOI-first hierarchy: DOI → ISBN → normalized title.
   *
   * Delegates to DuplicateDetectionService for processing.
   *
   * @returns Promise with totalDuplicates count and sampleGroups array
   */
  async detectDuplicates(): Promise<{
    totalDuplicates: number;
    sampleGroups: DuplicateGroup[];
  }> {
    const service = new DuplicateDetectionService(this);
    return service.detectDuplicates();
  }

  /**
   * Query library statistics for scope transparency.
   *
   * Returns counts for each library type and trash status:
   * - personalCount: Items in personal library (type='user'), not in trash
   * - groupCount: Items in group libraries (type='group'), not in trash
   * - feedCount: Items in feeds (type='feed'), not in trash
   * - trashCount: Items in trash (deletedItems), from all libraries
   *
   * Used by settings panel to display transparent scope information.
   *
   * @returns Promise with statistics object
   * @throws Error if database not connected
   */
  async queryLibraryStats(): Promise<{
    personalCount: number;
    groupCount: number;
    feedCount: number;
    trashCount: number;
  }> {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const results = this.db.exec(LIBRARY_STATS_QUERY);

      // Empty result handling (no items in database)
      if (!results || results.length === 0) {
        return {
          personalCount: 0,
          groupCount: 0,
          feedCount: 0,
          trashCount: 0
        };
      }

      const [result] = results;
      if (!result.values || result.values.length === 0) {
        return {
          personalCount: 0,
          groupCount: 0,
          feedCount: 0,
          trashCount: 0
        };
      }

      // Parse column-indexed results
      const columns = result.columns;
      const row = result.values[0];

      return {
        personalCount: (row[columns.indexOf('personalCount')] as number) || 0,
        groupCount: (row[columns.indexOf('groupCount')] as number) || 0,
        feedCount: (row[columns.indexOf('feedCount')] as number) || 0,
        trashCount: (row[columns.indexOf('trashCount')] as number) || 0
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Library stats query failed:', errorMessage);
      throw new Error(`Failed to query library statistics: ${errorMessage}`);
    }
  }

  /**
   * Check if connector is currently connected to a database
   */
  get isConnected(): boolean {
    return this.db !== null;
  }

  /**
   * Close the database connection and free resources.
   * Call this when done with the connector.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.dbPath = null;
    this.items = [];
    this.isLoaded = false;
  }

  /**
   * Test connection to a Zotero database.
   * Opens the database, checks schema version, counts items, then closes.
   *
   * @param dbPath - Full path to zotero.sqlite file
   * @returns Connection test result
   */
  async testConnection(dbPath: string): Promise<ConnectionTestResult> {
    try {
      await this.connect(dbPath);

      const schemaCheck = await this.checkSchemaVersion();
      if (!schemaCheck.supported) {
        this.close();
        return {
          success: false,
          itemCount: 0,
          schemaVersion: schemaCheck.version,
          error: schemaCheck.message
        };
      }

      // Count items
      const countResult = this.db!.exec(ITEM_COUNT_QUERY);
      const itemCount = countResult[0]?.values[0]?.[0] as number || 0;

      const result: ConnectionTestResult = {
        success: true,
        itemCount,
        schemaVersion: schemaCheck.version
      };

      this.close();
      return result;
    } catch (err) {
      this.close();
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        itemCount: 0,
        schemaVersion: 0,
        error: errorMessage
      };
    }
  }
}
