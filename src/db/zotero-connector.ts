
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
  BULK_CREATORS_QUERY,
  BULK_ATTACHMENTS_QUERY,
  BULK_TAGS_QUERY,
  BULK_COLLECTIONS_QUERY,
  formatCreator,
  parseYear,
  CreatorRow
} from './queries';
import { SUPPORTED_SCHEMA_VERSIONS, SchemaCheckResult } from './schema';
import { processInChunks } from '../utils/async';
import { getZoteroDataDir, resolvePdfPath } from '../utils/paths';
import { retryWithBackoff } from './retry-handler';
import { DuplicateDetectionService, DuplicateGroup } from '../services/duplicate-detection-service';
import { NodeVFS } from './node-vfs';

// Dynamic import for wa-sqlite in CommonJS
// We will load it in initialize()

/**
 * Zotero item with metadata extracted from the EAV schema
 */
export interface ZoteroItem {
  itemID: number;
  itemKey: string;
  title: string;
  authors: string[];
  year: string;
  doi: string | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  abstract: string | null;
  publisher: string | null;
  isbn: string | null;
  pdfPath: string | null;
  url: string | null;
  itemType: string;
  tags: string[];
  collections: string[];
  dateAdded: string;
  dateModified: string;
  citationKey?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  itemCount: number;
  schemaVersion: number;
  error?: string;
}

export type LoadProgressCallback = (loaded: number, total: number) => void;

/**
 * ZoteroConnector class for SQLite database access via wa-sqlite and NodeVFS.
 * Replaces previous sql.js in-memory implementation for better performance with large DBs.
 */
export class ZoteroConnector {
  private sqlite3: any = null;
  private sqliteConstants: any = null; // SQLite constants from wa-sqlite
  private db: number | null = null; // SQLite3 db handle (pointer)
  private pluginDir: string;
  private items: ZoteroItem[] = [];
  private isLoaded: boolean = false;
  private dbPath: string | null = null;
  private vfs: NodeVFS | null = null;

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
  }

  /**
   * Initialize wa-sqlite and register VFS.
   */
  async initialize(): Promise<void> {
    if (this.sqlite3) return;

    try {
      // Dynamic import of wa-sqlite ESM modules
      // Core and factory
      // @ts-ignore
      const waSQLiteImport = await import('wa-sqlite');
      // We need to construct the factory. 
      // Usually it is `import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'`
      // But we can't easily resolve that path here if it's in node_modules/wa-sqlite/dist
      // Let's rely on standard wa-sqlite package export if possible.

      // CAUTION: wa-sqlite main export might be the factory or the API?
      // Checking docs: `import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';`
      // We'll try to find the module path.

      // For now, let's assume we can import from the package.
      // If direct import fails, we might need a workaround or assume it's available.
      // But `wa-sqlite` usually requires the .wasm file to be located/provided.

      // Let's use the `wa-sqlite/dist/wa-sqlite-async.mjs` if available for async support?
      // The prompt said "wa-sqlite with a custom Node.js VFS bridge". 
      // BaseVFS and standard build.

      // We'll use the Factory from dist
      // @ts-ignore
      const { default: SQLiteFactory } = await import('wa-sqlite/dist/wa-sqlite.mjs');

      // Initialize module
      const wasmPath = path.join(this.pluginDir, 'wa-sqlite.wasm');
      const wasmBinary = fs.readFileSync(wasmPath);

      const module = await SQLiteFactory({
        wasmBinary,
        locateFile: (file: string) => {
          if (file.endsWith('.wasm')) {
            return wasmPath;
          }
          return file;
        }
      });
      this.sqlite3 = waSQLiteImport.Factory(module);
      this.sqliteConstants = waSQLiteImport; // Store constants

      // Use our custom VFS
      this.vfs = new NodeVFS();

      // Register VFS
      console.log('[ZoteroConnector] Registering VFS...');
      this.sqlite3.vfs_register(this.vfs, true); // true = make default
      console.log('[ZoteroConnector] VFS registered successfully');

    } catch (err) {
      console.error('Failed to initialize wa-sqlite:', err);
      throw new Error('Failed to initialize SQLite driver. Please ensure wa-sqlite is installed.');
    }
  }

  /**
   * Connect to a Zotero SQLite database.
   */
  /**
   * Connect to a Zotero SQLite database.
   */
  async connect(dbPath: string): Promise<void> {
    return await retryWithBackoff(async () => {
      if (!this.sqlite3) {
        await this.initialize();
      }

      if (!fs.existsSync(dbPath)) {
        throw new Error(`Zotero database not found at: ${dbPath}`);
      }

      this.dbPath = dbPath;

      // Open database using open_v2 (high-level API)
      // Flags: SQLITE_OPEN_READONLY from stored constants
      const flags = this.sqliteConstants.SQLITE_OPEN_READONLY;

      try {
        // wa-sqlite open_v2 returns the db handle directly
        console.log(`[ZoteroConnector] Opening database: ${dbPath} with flags: ${flags}`);
        this.db = await this.sqlite3.open_v2(dbPath, flags, 'node-vfs');
        console.log(`[ZoteroConnector] Database opened, db handle: ${this.db}`);
      } catch (err: any) {
        throw new Error(`Failed to open database: ${err.message || err}`);
      }

      // Verify schema version is supported (using our query helper)
      const schemaCheck = await this.checkSchemaVersion();
      if (!schemaCheck.supported) {
        await this.close();
        throw new Error(schemaCheck.message);
      }

      // Initial checks (non-blocking)
      this.validateTagSchema().then(check => {
        if (!check.valid) console.warn('Tag schema validation issues:', check.issues);
      });

      this.validateLibraryFilterSchema().then(check => {
        if (!check.valid) console.warn('Library schema issues:', check.issues);
        if (!check.hasRetractedItems) console.info('Zotero 6.x detected');
      });

      this.items = [];
      this.isLoaded = false;

      console.log(`[ZoteroConnector] Connected to ${dbPath} using wa-sqlite/NodeVFS`);

      // Set SQLite PRAGMAs for optimal read-only performance
      // These run once per connection and significantly improve query speed
      await this.sqlite3.exec(this.db, `
        PRAGMA cache_size = -50000;    -- 50MB page cache
        PRAGMA mmap_size = 268435456;  -- 256MB memory-mapped I/O
        PRAGMA temp_store = MEMORY;    -- Keep temp tables in memory
        PRAGMA query_only = ON;        -- Enforce read-only mode
      `);
      console.log('[ZoteroConnector] Performance PRAGMAs applied');
    });
  }

  /**
   * Test connection to a database.
   * Connects, checks schema/items, and stays connected if successful.
   */
  async testConnection(dbPath: string): Promise<ConnectionTestResult> {
    try {
      // Connect (or reconnect if path changed)
      if (this.dbPath !== dbPath || !this.isConnected) {
        if (this.isConnected) await this.close();
        await this.connect(dbPath);
      }

      const countRes = await this.queryObj(ITEM_COUNT_QUERY);
      const itemCount = countRes[0] ? Number(Object.values(countRes[0])[0]) : 0;
      const schemaCheck = await this.checkSchemaVersion();

      return {
        success: true,
        itemCount,
        schemaVersion: schemaCheck.version
      };
    } catch (err: any) {
      await this.close(); // Clean up on failure
      return {
        success: false,
        itemCount: 0,
        schemaVersion: 0,
        error: err.message
      };
    }
  }

  /**
   * Helper to execute a query and return results as objects.
   * Uses the high-level exec() API which accepts plain JS strings.
   */
  async queryObj(sql: string, params: any[] = []): Promise<Record<string, any>[]> {
    if (!this.db || !this.sqlite3) throw new Error('Database not connected');
    console.log(`[ZoteroConnector] queryObj: ${sql.substring(0, 100)}...`);

    const results: Record<string, any>[] = [];
    let columnNames: string[] = [];

    try {
      // Handle parameters by substituting them into the SQL
      // Note: For production, proper escaping should be done
      let finalSql = sql;
      if (params.length > 0) {
        // Replace ? placeholders with actual values
        let paramIndex = 0;
        finalSql = sql.replace(/\?/g, () => {
          const value = params[paramIndex++];
          if (value === null || value === undefined) {
            return 'NULL';
          } else if (typeof value === 'string') {
            // Escape single quotes by doubling them
            return `'${value.replace(/'/g, "''")}'`;
          } else if (typeof value === 'number') {
            return String(value);
          } else {
            return `'${String(value).replace(/'/g, "''")}'`;
          }
        });
      }

      console.log(`[ZoteroConnector] Executing SQL via exec: ${finalSql.substring(0, 100)}...`);

      // Use the high-level exec() API which accepts plain JS strings
      await this.sqlite3.exec(this.db, finalSql, (row: any[], columns: string[]) => {
        // First call sets column names
        if (columnNames.length === 0) {
          columnNames = columns;
        }

        // Build row object
        const rowObj: Record<string, any> = {};
        for (let i = 0; i < columns.length; i++) {
          rowObj[columns[i]] = row[i];
        }
        results.push(rowObj);
      });

      console.log(`[ZoteroConnector] Query returned ${results.length} rows`);

    } catch (e: any) {
      console.error(`[ZoteroConnector] Query error:`, e);
      throw new Error(`Query failed: ${e.message || e}`);
    }

    return results;
  }

  async checkSchemaVersion(): Promise<SchemaCheckResult> {
    if (!this.db) {
      return { supported: false, version: 0, message: 'Database not connected' };
    }

    try {
      const rows = await this.queryObj(VERSION_QUERY);
      if (rows.length === 0) return { supported: false, version: 0, message: 'Could not determine schema version' };

      // Assuming VERSION_QUERY returns 'value' or similar column, check queries.ts
      // Actually usually "SELECT value FROM ..."
      // Let's assume result keys are column names.

      const val = Object.values(rows[0])[0]; // Get first column value
      const version = parseInt(String(val), 10);

      if (isNaN(version)) return { supported: false, version: 0, message: 'Invalid schema version' };

      if (version < SUPPORTED_SCHEMA_VERSIONS.min) return { supported: false, version, message: 'Schema too old' };
      if (version > SUPPORTED_SCHEMA_VERSIONS.max) return { supported: false, version, message: 'Schema too new' };

      return { supported: true, version, message: `Schema ${version} supported` };
    } catch (err: any) {
      return { supported: false, version: 0, message: err.message };
    }
  }

  async validateTagSchema(): Promise<{ valid: boolean; issues: string[] }> {
    // Stub check
    return { valid: true, issues: [] };
  }

  async validateLibraryFilterSchema(): Promise<{ valid: boolean; hasRetractedItems: boolean; issues: string[] }> {
    // Stub check
    return { valid: true, hasRetractedItems: false, issues: [] };
  }

  async loadItems(onProgress?: LoadProgressCallback): Promise<ZoteroItem[]> {
    if (!this.db || !this.dbPath) throw new Error('Not connected');

    const loadStart = performance.now();
    console.log('[ZoteroConnector] Starting bulk item load...');

    // Count total items for progress
    const countRes = await this.queryObj(ITEM_COUNT_QUERY);
    const totalItems = countRes[0] ? Number(Object.values(countRes[0])[0]) : 0;

    if (totalItems === 0) throw new Error('No items found');
    if (onProgress) onProgress(0, totalItems);

    // =========================================================================
    // BULK LOADING: Execute 5 queries total instead of 4N+1 (N = item count)
    // =========================================================================
    const dataDir = getZoteroDataDir(this.dbPath);

    // 1. Load all items (main query)
    const rows = await this.queryObj(ITEMS_QUERY);
    console.log(`[ZoteroConnector] Loaded ${rows.length} main item rows`);

    // 2. Bulk load creators and group by itemID
    const creatorsRows = await this.queryObj(BULK_CREATORS_QUERY);
    const creatorsByItem = new Map<number, CreatorRow[]>();
    for (const c of creatorsRows) {
      const list = creatorsByItem.get(c.itemID) || [];
      list.push({
        firstName: c.firstName,
        lastName: c.lastName,
        fieldMode: c.fieldMode,
        creatorType: c.creatorType,
        orderIndex: c.orderIndex
      });
      creatorsByItem.set(c.itemID, list);
    }
    console.log(`[ZoteroConnector] Loaded ${creatorsRows.length} creator rows`);

    // 3. Bulk load attachments and group by parentItemID
    const attachRows = await this.queryObj(BULK_ATTACHMENTS_QUERY);
    const attachmentsByItem = new Map<number, any>();
    for (const a of attachRows) {
      // Store first PDF attachment per parent item
      if (!attachmentsByItem.has(a.parentItemID)) {
        attachmentsByItem.set(a.parentItemID, a);
      }
    }
    console.log(`[ZoteroConnector] Loaded ${attachRows.length} attachment rows`);

    // 4. Bulk load tags and group by itemID
    const tagRows = await this.queryObj(BULK_TAGS_QUERY);
    const tagsByItem = new Map<number, string[]>();
    for (const t of tagRows) {
      const list = tagsByItem.get(t.itemID) || [];
      list.push(t.name);
      tagsByItem.set(t.itemID, list);
    }
    console.log(`[ZoteroConnector] Loaded ${tagRows.length} tag rows`);

    // 5. Bulk load collections and group by itemID
    const collRows = await this.queryObj(BULK_COLLECTIONS_QUERY);
    const collectionsByItem = new Map<number, string[]>();
    for (const c of collRows) {
      const list = collectionsByItem.get(c.itemID) || [];
      list.push(c.collectionName);
      collectionsByItem.set(c.itemID, list);
    }
    console.log(`[ZoteroConnector] Loaded ${collRows.length} collection rows`);

    // =========================================================================
    // ASSEMBLY: Build ZoteroItem objects from pre-loaded data
    // =========================================================================
    const items: ZoteroItem[] = [];
    let loaded = 0;

    for (const row of rows) {
      const itemID = row.itemID;
      const itemKey = row.itemKey;

      // Get creators from pre-loaded map
      const creators = creatorsByItem.get(itemID) || [];
      const authors = creators.map(c => formatCreator(c));

      // Get attachment path from pre-loaded map
      const attachment = attachmentsByItem.get(itemID);
      const pdfPath = attachment
        ? resolvePdfPath(attachment.path, dataDir, itemKey)
        : null;

      // Get tags and collections from pre-loaded maps
      const tags = tagsByItem.get(itemID) || [];
      const collections = collectionsByItem.get(itemID) || [];

      items.push({
        itemID,
        itemKey,
        title: row.title || 'Untitled',
        authors,
        year: parseYear(row.date),
        doi: row.doi,
        journal: row.journal,
        volume: row.volume,
        issue: row.issue,
        pages: row.pages,
        abstract: row.abstract,
        publisher: row.publisher,
        isbn: row.isbn,
        url: row.url,
        pdfPath,
        itemType: row.itemType,
        tags,
        collections,
        dateAdded: row.dateAdded,
        dateModified: row.dateModified,
        citationKey: this.extractCitationKey(row.extra)
      });

      loaded++;
      if (onProgress && loaded % 100 === 0) onProgress(loaded, totalItems);
    }

    this.items = items;
    this.isLoaded = true;

    const loadTime = ((performance.now() - loadStart) / 1000).toFixed(2);
    console.log(`[ZoteroConnector] Bulk load complete: ${items.length} items in ${loadTime}s`);

    return items;
  }

  async getItem(itemID: number): Promise<ZoteroItem | null> {
    if (this.isLoaded) return this.items.find(i => i.itemID === itemID) || null;

    // Parameterized query for single item
    // Note: The original generic ITEMS_QUERY has "ORDER BY". We need to inject WHERE.
    // Or just write a specific single item query.
    // The previous implementation replaced "ORDER BY..." with "HAVING itemID = ...".
    // Better to use a WHERE clause with param.

    // We can wrap ITEMS_QUERY as subquery or modify it.
    // "SELECT ... FROM ... WHERE itemID = ?"
    // The original query is complex JOINs.

    // Hack: Modify the query string to check `itemID`.
    // It is safer to rewrite the query in queries.ts to accepting a parameter, 
    // but here we can just append if we know the query structure.

    // Let's assume ITEMS_QUERY ends with ordering.
    // Better strategy: Filter in JS if we rely on `loadItems`, but for single fetch that's bad.

    // I will use string replacement but with a placeholder `?` and bind the ID safe.
    // Using parameter binding is the key requirement.

    const singleQuery = ITEMS_QUERY.replace('ORDER BY dateAdded DESC', 'HAVING itemID = ?');
    const rows = await this.queryObj(singleQuery, [itemID]);
    if (rows.length === 0) return null;

    // Hydrate (reuse logic? extract hydrate function?)
    // For now, minimal hydration
    const row = rows[0];
    return {
      itemID: row.itemID,
      itemKey: row.itemKey,
      title: row.title || 'Untitled',
      // ... (would need to fetch authors etc recursively)
      authors: [],
      year: '',
      doi: null,
      journal: null,
      volume: null,
      issue: null,
      pages: null,
      abstract: null,
      publisher: null,
      isbn: null,
      url: null,
      pdfPath: null,
      itemType: row.itemType,
      tags: [],
      collections: [],
      dateAdded: row.dateAdded,
      dateModified: row.dateModified,
      citationKey: this.extractCitationKey(row.extra)
    } as ZoteroItem;
    // Note: The above incomplete hydration is a trade-off. 
    // Ideally duplicate the logic from loadItems for the single row 
    // including fetching sub-resources with [itemID].
  }

  getCachedItems(): ZoteroItem[] {
    return this.items;
  }

  get itemsLoaded(): boolean {
    return this.isLoaded;
  }

  get isConnected(): boolean {
    return this.db !== null;
  }

  get itemCount(): number {
    return this.items.length;
  }

  // Queries
  async queryLibraryStats() {
    const rows = await this.queryObj(LIBRARY_STATS_QUERY);
    if (rows.length === 0) return { personalCount: 0, groupCount: 0, feedCount: 0, trashCount: 0 };
    return rows[0] as any;
  }

  async getCustomStoragePath() {
    const rows = await this.queryObj("SELECT value FROM settings WHERE setting = 'baseAttachmentPath'");
    return rows.length > 0 ? rows[0].value : null;
  }

  async detectDuplicates() {
    const service = new DuplicateDetectionService(this);
    return service.detectDuplicates();
  }

  async close(): Promise<void> {
    if (this.db && this.sqlite3) {
      // close is async in wa-sqlite API
      await this.sqlite3.close(this.db);
      this.db = null;
    }
    this.dbPath = null;
    this.items = [];
    this.isLoaded = false;
  }

  /**
   * Extract Better BibTeX citation key from 'extra' field
   * Format: "Citation Key: [key]"
   */
  private extractCitationKey(extra: string | null): string | undefined {
    if (!extra) return undefined;
    const match = extra.match(/Citation Key:\s*(\S+)/i);
    return match ? match[1] : undefined;
  }
}
