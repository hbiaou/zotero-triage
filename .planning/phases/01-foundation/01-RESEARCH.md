# Phase 1: Foundation - Research

**Researched:** 2026-01-22
**Domain:** SQLite database access, Obsidian plugin settings, file creation, state persistence
**Confidence:** HIGH

## Summary

Phase 1 focuses on three core capabilities: reading Zotero's SQLite database, persisting processing state as JSON, and generating literature notes with YAML frontmatter. The research validates that **sql.js** (WebAssembly-based SQLite) is the correct choice for Obsidian plugins, avoiding native module complexities. Zotero's database schema uses an EAV (Entity-Attribute-Value) pattern for item metadata, requiring specific SQL joins to extract titles, authors, DOI, and other fields.

Key findings:
- sql.js works in Obsidian but requires careful WASM file configuration via `locateFile`
- Zotero stores metadata in `itemData` + `itemDataValues` tables with field IDs, not direct columns
- Read-only concurrent access is safe when Zotero uses WAL mode (default)
- Zotero 6.x and 7.x use the same core schema; version detection via `version` table
- Obsidian's `vault.create()` handles file creation with automatic indexing

**Primary recommendation:** Use sql.js with Node.js `fs.readFileSync` for external file access (Zotero database is outside vault), implement chunked async processing for 5000+ items, and store minimal state (IDs + status only) in JSON registry.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sql.js | 1.13.0+ | SQLite read access (WebAssembly) | No native bindings; works in Obsidian's Electron environment |
| obsidian | latest | Plugin API (Modal, Setting, Vault) | Official Obsidian plugin framework |
| lodash.debounce | 4.0.8 | Debounce state saves | Obsidian's built-in debounce has quirks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/lodash.debounce | 4.0.9 | TypeScript types for debounce | Development only |
| path (Node.js built-in) | N/A | Cross-platform path handling | Always use for file paths |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sql.js | better-sqlite3 | Native module requires Electron rebuild; fails with `bindings` package in Obsidian |
| sql.js | obsidian-sqlite3 plugin | External dependency; user must install two plugins |
| lodash.debounce | es-toolkit | Smaller bundle but newer/less proven |

**Installation:**
```bash
npm install sql.js lodash.debounce
npm install --save-dev @types/lodash.debounce
```

**WASM file distribution:** Copy `node_modules/sql.js/dist/sql-wasm.wasm` to plugin directory and include in release.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── main.ts                 # Plugin entry point
├── settings.ts             # PluginSettingTab implementation
├── db/
│   ├── zotero-connector.ts # SQLite connection and queries
│   ├── schema.ts           # Zotero field ID mappings
│   └── queries.ts          # SQL query builders
├── registry/
│   ├── registry-service.ts # State management
│   └── types.ts            # Registry interfaces
├── notes/
│   ├── note-generator.ts   # Markdown file creation
│   └── templates.ts        # Frontmatter templates
├── ui/
│   ├── search-modal.ts     # FuzzySuggestModal for item search
│   └── preview-modal.ts    # Note preview before creation
└── utils/
    ├── paths.ts            # Cross-platform path utilities
    └── async.ts            # Chunked processing helpers
```

### Pattern 1: sql.js Initialization with WASM
**What:** Load sql.js with WebAssembly file from plugin directory
**When to use:** At plugin load time (lazy, on first database access)
**Example:**
```typescript
// Source: Obsidian Forum discussion + sql.js docs
import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

class ZoteroConnector {
  private db: Database | null = null;
  private SQL: any = null;

  constructor(private pluginDir: string) {}

  async initialize(): Promise<void> {
    // Load WASM from plugin directory
    const wasmPath = path.join(this.pluginDir, 'sql-wasm.wasm');
    const wasmBinary = fs.readFileSync(wasmPath);

    this.SQL = await initSqlJs({
      wasmBinary: wasmBinary
    });
  }

  async connect(dbPath: string): Promise<void> {
    if (!this.SQL) await this.initialize();

    // Read Zotero database (external to vault, use Node fs)
    const dbBuffer = fs.readFileSync(dbPath);
    this.db = new this.SQL.Database(new Uint8Array(dbBuffer));
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
```

### Pattern 2: Zotero EAV Query Pattern
**What:** Extract item metadata from Zotero's Entity-Attribute-Value schema
**When to use:** Any query for item fields (title, DOI, year, journal, etc.)
**Example:**
```typescript
// Source: Zotero schema analysis + GitHub Gist pchemguy
const ITEM_FIELDS_QUERY = `
WITH itemFields AS (
  SELECT
    i.itemID,
    i.key AS itemKey,
    i.dateAdded,
    i.dateModified,
    it.typeName AS itemType,
    f.fieldName,
    idv.value
  FROM items i
  JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
  LEFT JOIN itemData id ON i.itemID = id.itemID
  LEFT JOIN fields f ON id.fieldID = f.fieldID
  LEFT JOIN itemDataValues idv ON id.valueID = idv.valueID
  WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
    AND it.typeName != 'attachment'
    AND it.typeName != 'note'
)
SELECT
  itemID,
  itemKey,
  dateAdded,
  dateModified,
  itemType,
  MAX(CASE WHEN fieldName = 'title' THEN value END) AS title,
  MAX(CASE WHEN fieldName = 'DOI' THEN value END) AS doi,
  MAX(CASE WHEN fieldName = 'date' THEN value END) AS date,
  MAX(CASE WHEN fieldName = 'publicationTitle' THEN value END) AS journal,
  MAX(CASE WHEN fieldName = 'volume' THEN value END) AS volume,
  MAX(CASE WHEN fieldName = 'pages' THEN value END) AS pages,
  MAX(CASE WHEN fieldName = 'abstractNote' THEN value END) AS abstract
FROM itemFields
GROUP BY itemID
ORDER BY dateAdded DESC
`;
```

### Pattern 3: Creators/Authors Query
**What:** Extract author information with proper ordering
**When to use:** Building author list for frontmatter
**Example:**
```typescript
// Source: Zotero schema + pchemguy Gist
const CREATORS_QUERY = `
SELECT
  ic.itemID,
  c.firstName,
  c.lastName,
  c.fieldMode,
  ct.creatorType,
  ic.orderIndex
FROM itemCreators ic
JOIN creators c ON ic.creatorID = c.creatorID
JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
WHERE ic.itemID = ?
ORDER BY ic.orderIndex
`;

// fieldMode: 0 = firstName + lastName, 1 = single field (institution/fullName)
function formatCreator(row: any): string {
  if (row.fieldMode === 1) {
    return row.lastName; // Single field mode (institution name)
  }
  return `${row.lastName}, ${row.firstName}`;
}
```

### Pattern 4: Attachment Path Query
**What:** Get PDF attachment paths for items
**When to use:** Adding PDF link to frontmatter
**Example:**
```typescript
// Source: Zotero schema
const ATTACHMENTS_QUERY = `
SELECT
  ia.itemID,
  ia.parentItemID,
  ia.linkMode,
  ia.path,
  ia.contentType
FROM itemAttachments ia
WHERE ia.parentItemID = ?
  AND ia.contentType = 'application/pdf'
`;

// linkMode: 0=importedFile, 1=importedURL, 2=linkedFile, 3=linkedURL
// path format:
//   - importedFile: "storage:filename.pdf" (in storage/{itemKey}/)
//   - linkedFile: "attachments:relative/path.pdf" (relative to base dir)
function resolvePdfPath(row: any, dataDir: string, itemKey: string): string | null {
  if (!row.path) return null;

  if (row.path.startsWith('storage:')) {
    const filename = row.path.replace('storage:', '');
    return path.join(dataDir, 'storage', itemKey, filename);
  }

  if (row.path.startsWith('attachments:')) {
    // Requires baseAttachmentPath from Zotero settings
    return row.path.replace('attachments:', ''); // Relative path
  }

  return row.path; // Absolute path
}
```

### Pattern 5: FuzzySuggestModal for Item Search
**What:** Search modal with fuzzy matching for Zotero items
**When to use:** User searching for item to import
**Example:**
```typescript
// Source: Obsidian docs + community examples
import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';

interface ZoteroItem {
  itemID: number;
  title: string;
  authors: string[];
  year: string;
}

class ItemSearchModal extends FuzzySuggestModal<ZoteroItem> {
  private items: ZoteroItem[];
  private onSelect: (item: ZoteroItem) => void;

  constructor(app: App, items: ZoteroItem[], onSelect: (item: ZoteroItem) => void) {
    super(app);
    this.items = items;
    this.onSelect = onSelect;
    this.setPlaceholder('Search by title or author...');
  }

  getItems(): ZoteroItem[] {
    return this.items;
  }

  getItemText(item: ZoteroItem): string {
    const authors = item.authors.slice(0, 2).join(', ');
    return `${item.title} - ${authors} (${item.year})`;
  }

  renderSuggestion(match: FuzzyMatch<ZoteroItem>, el: HTMLElement): void {
    const item = match.item;
    el.createEl('div', { text: item.title, cls: 'suggestion-title' });
    el.createEl('small', {
      text: `${item.authors.join(', ')} (${item.year})`,
      cls: 'suggestion-meta'
    });
  }

  onChooseItem(item: ZoteroItem, evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item);
  }
}
```

### Pattern 6: Registry State Persistence
**What:** Track processed items with debounced JSON saves
**When to use:** Any state change (item imported, rejected, etc.)
**Example:**
```typescript
// Source: Obsidian docs + community best practices
import { debounce } from 'lodash';

interface RegistryEntry {
  state: 'unseen' | 'proposed' | 'accepted' | 'rejected' | 'imported';
  timestamp: number;
}

interface Registry {
  version: number;
  entries: Record<string, RegistryEntry>; // itemID -> entry
  lastModified: number;
}

class RegistryService {
  private registry: Registry;
  private plugin: Plugin;

  // Debounce saves to avoid excessive disk writes
  private debouncedSave = debounce(async () => {
    this.registry.lastModified = Date.now();
    await this.plugin.saveData({ registry: this.registry });
  }, 2000);

  async load(): Promise<void> {
    const data = await this.plugin.loadData();
    this.registry = data?.registry || this.getDefault();

    // Validate loaded data
    if (!this.registry.entries || typeof this.registry.entries !== 'object') {
      console.warn('Invalid registry, using defaults');
      this.registry = this.getDefault();
    }
  }

  markState(itemId: string, state: RegistryEntry['state']): void {
    this.registry.entries[itemId] = {
      state,
      timestamp: Date.now()
    };
    this.debouncedSave();
  }

  getState(itemId: string): RegistryEntry['state'] {
    return this.registry.entries[itemId]?.state || 'unseen';
  }

  private getDefault(): Registry {
    return { version: 1, entries: {}, lastModified: Date.now() };
  }
}
```

### Anti-Patterns to Avoid
- **Loading entire database into memory repeatedly:** Load once at startup, cache in memory
- **Synchronous processing of 5000+ items:** Always use chunked async with yield points
- **Using better-sqlite3:** Native modules fail in Obsidian's Electron environment
- **Using Node.js fs for vault files:** Use `app.vault.create()` for notes (triggers indexing)
- **Hardcoding Zotero paths:** Auto-detect first, allow manual override
- **Storing full item metadata in registry:** Store only IDs + state to keep JSON small

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite parsing | Custom binary parser | sql.js | WebAssembly-based, handles all SQLite features |
| Fuzzy search | Custom string matching | FuzzySuggestModal | Built into Obsidian, handles keyboard navigation |
| Debouncing | setTimeout wrapper | lodash.debounce | Edge case handling (leading/trailing, cancel) |
| Path joining | String concatenation | Node.js `path.join` | Cross-platform separators, normalization |
| YAML frontmatter | String templates with escaping | Template literals with proper escaping | Watch for colons, quotes in titles |
| File creation | fs.writeFile | app.vault.create | Triggers Obsidian indexing, respects vault |

**Key insight:** The Zotero EAV schema looks simple but has many edge cases (field modes, attachment link modes, deleted items). Copy the proven SQL patterns rather than discovering these edge cases yourself.

## Common Pitfalls

### Pitfall 1: SQLITE_BUSY When Zotero Is Running
**What goes wrong:** Database locked errors when reading while Zotero has the file open
**Why it happens:** SQLite file locking; Zotero's caching layer bypasses normal locking
**How to avoid:**
- Open read-only: file must exist, never attempt writes
- Zotero uses WAL mode by default, which allows concurrent reads
- If errors persist, add retry with exponential backoff
- NEVER write to Zotero's database
**Warning signs:** Intermittent SQLITE_BUSY errors, especially during Zotero sync

### Pitfall 2: Zotero Schema Version Mismatch
**What goes wrong:** Queries fail after Zotero updates; missing columns or tables
**Why it happens:** Schema can change between Zotero releases (official warning)
**How to avoid:**
- Query schema version at startup: `SELECT value FROM version WHERE schema='userdata'`
- Check for expected tables/columns before querying
- Display clear error if unsupported version detected
- Test against both Zotero 6.x and 7.x databases
**Warning signs:** SQL errors after Zotero updates, missing data, wrong field mappings

### Pitfall 3: UI Freeze with Large Libraries
**What goes wrong:** Obsidian becomes unresponsive during initial load or search
**Why it happens:** Main thread blocked; no Web Workers in Obsidian plugins
**How to avoid:**
```typescript
async function processInChunks<T>(
  items: T[],
  processor: (item: T) => void,
  chunkSize = 50
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    chunk.forEach(processor);
    // Yield to event loop
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```
**Warning signs:** Obsidian freeze during plugin load, "Not Responding" in title bar

### Pitfall 4: Cross-Platform Path Failures
**What goes wrong:** Plugin works on Windows, fails on Mac/Linux (or vice versa)
**Why it happens:** Path separator differences (`\` vs `/`), different home directories
**How to avoid:**
- Always use `path.join()` for path construction
- Use `os.homedir()` for home directory detection
- Store relative paths in registry, resolve at runtime
- Test on all three platforms before release
**Warning signs:** "File not found" errors on specific OS, path with wrong separators

### Pitfall 5: WASM File Not Found
**What goes wrong:** sql.js fails to initialize with "WebAssembly file not found"
**Why it happens:** WASM file not copied to plugin directory, wrong locateFile path
**How to avoid:**
- Copy `sql-wasm.wasm` to plugin root during build
- Use `wasmBinary` option with `fs.readFileSync` instead of `locateFile`
- Verify WASM file is included in release package
**Warning signs:** Error during sql.js initialization, "fetch failed" for WASM

## Code Examples

### Complete Settings Tab
```typescript
// Source: Obsidian docs + community patterns
import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import * as fs from 'fs';

interface ZotBridgeSettings {
  zoteroDbPath: string;
  outputFolder: string;
}

const DEFAULT_SETTINGS: ZotBridgeSettings = {
  zoteroDbPath: '',
  outputFolder: '10_Literature'
};

class ZotBridgeSettingTab extends PluginSettingTab {
  plugin: ZotBridgePlugin;

  constructor(app: App, plugin: ZotBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'ZotBridge Settings' });

    // Database path setting
    new Setting(containerEl)
      .setName('Zotero Database Path')
      .setDesc('Path to zotero.sqlite file')
      .addText(text => text
        .setPlaceholder('/path/to/Zotero/zotero.sqlite')
        .setValue(this.plugin.settings.zoteroDbPath)
        .onChange(async (value) => {
          this.plugin.settings.zoteroDbPath = value;
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText('Auto-detect')
        .onClick(async () => {
          const detected = this.autoDetectPath();
          if (detected) {
            this.plugin.settings.zoteroDbPath = detected;
            await this.plugin.saveSettings();
            this.display(); // Refresh
            new Notice('Database found: ' + detected);
          } else {
            new Notice('Could not auto-detect. Please set path manually.');
          }
        }));

    // Validate path button
    new Setting(containerEl)
      .addButton(btn => btn
        .setButtonText('Test Connection')
        .onClick(async () => {
          const path = this.plugin.settings.zoteroDbPath;
          if (!path) {
            new Notice('Please set database path first');
            return;
          }
          if (!fs.existsSync(path)) {
            new Notice('File not found: ' + path);
            return;
          }
          try {
            await this.plugin.connector.testConnection(path);
            new Notice('Connection successful!');
          } catch (err) {
            new Notice('Connection failed: ' + err.message);
          }
        }));

    // Output folder setting
    new Setting(containerEl)
      .setName('Output Folder')
      .setDesc('Folder for literature notes (relative to vault root)')
      .addText(text => text
        .setPlaceholder('10_Literature')
        .setValue(this.plugin.settings.outputFolder)
        .onChange(async (value) => {
          this.plugin.settings.outputFolder = value;
          await this.plugin.saveSettings();
        }));
  }

  private autoDetectPath(): string | null {
    const os = require('os');
    const path = require('path');
    const platform = process.platform;
    const home = os.homedir();

    const possiblePaths = [];

    if (platform === 'win32') {
      possiblePaths.push(path.join(home, 'Zotero', 'zotero.sqlite'));
    } else if (platform === 'darwin') {
      possiblePaths.push(path.join(home, 'Zotero', 'zotero.sqlite'));
    } else {
      possiblePaths.push(path.join(home, 'Zotero', 'zotero.sqlite'));
      possiblePaths.push(path.join(home, '.zotero', 'zotero', 'zotero.sqlite'));
    }

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }
}
```

### Literature Note Generator
```typescript
// Source: Obsidian Vault API
import { App, TFile, Notice } from 'obsidian';

interface ZoteroItem {
  itemID: number;
  itemKey: string;
  title: string;
  authors: string[];
  year: string;
  doi: string | null;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  abstract: string | null;
  pdfPath: string | null;
  itemType: string;
}

class NoteGenerator {
  constructor(private app: App, private outputFolder: string) {}

  async createNote(item: ZoteroItem): Promise<TFile> {
    const filename = this.sanitizeFilename(item.title);
    const filepath = `${this.outputFolder}/${filename}.md`;

    // Check for existing file
    const existing = this.app.vault.getAbstractFileByPath(filepath);
    if (existing) {
      throw new Error(`Note already exists: ${filepath}`);
    }

    // Ensure output folder exists
    await this.ensureFolder(this.outputFolder);

    const content = this.generateContent(item);
    const file = await this.app.vault.create(filepath, content);

    return file;
  }

  private generateContent(item: ZoteroItem): string {
    // Escape YAML special characters
    const escapeYaml = (str: string | null): string => {
      if (!str) return '';
      // Wrap in quotes if contains special chars
      if (str.includes(':') || str.includes('#') || str.includes('"')) {
        return `"${str.replace(/"/g, '\\"')}"`;
      }
      return str;
    };

    const authorsYaml = item.authors.length > 0
      ? item.authors.map(a => `  - "${a}"`).join('\n')
      : '  - Unknown';

    const zoteroLink = `zotero://select/items/0_${item.itemKey}`;

    return `---
title: ${escapeYaml(item.title)}
authors:
${authorsYaml}
year: ${item.year || 'Unknown'}
doi: ${item.doi || ''}
journal: ${escapeYaml(item.journal)}
volume: ${item.volume || ''}
pages: ${item.pages || ''}
item-type: ${item.itemType}
zotero-key: ${item.itemKey}
zotero-link: ${zoteroLink}
pdf-path: ${escapeYaml(item.pdfPath)}
abstract: >
  ${item.abstract?.replace(/\n/g, '\n  ') || 'No abstract available.'}
created: ${new Date().toISOString().split('T')[0]}
---

## Summary



## Key Points

-

## Notes

`;
  }

  private sanitizeFilename(title: string): string {
    return title
      .replace(/[<>:"/\\|?*]/g, '') // Remove illegal chars
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .trim()
      .slice(0, 100);                // Limit length
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }
  }
}
```

### Schema Version Detection
```typescript
// Source: Zotero documentation
const VERSION_QUERY = `
SELECT value FROM version WHERE schema = 'userdata'
`;

const SUPPORTED_VERSIONS = {
  min: 100, // Zotero 6.x
  max: 200  // Zotero 7.x (estimated)
};

async function checkSchemaVersion(db: Database): Promise<{
  supported: boolean;
  version: number;
  message: string;
}> {
  try {
    const result = db.exec(VERSION_QUERY);
    if (result.length === 0 || result[0].values.length === 0) {
      return {
        supported: false,
        version: 0,
        message: 'Could not determine Zotero schema version'
      };
    }

    const version = parseInt(result[0].values[0][0] as string, 10);

    if (version < SUPPORTED_VERSIONS.min) {
      return {
        supported: false,
        version,
        message: `Zotero schema version ${version} is too old. Please upgrade Zotero.`
      };
    }

    if (version > SUPPORTED_VERSIONS.max) {
      return {
        supported: false,
        version,
        message: `Zotero schema version ${version} is newer than supported. Please update ZotBridge.`
      };
    }

    return { supported: true, version, message: 'OK' };
  } catch (err) {
    return {
      supported: false,
      version: 0,
      message: `Error reading schema version: ${err.message}`
    };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| better-sqlite3 in Obsidian | sql.js (WebAssembly) | 2023+ | Avoids native module hell in Electron |
| Zotero Web API for data | Direct SQLite read | N/A | Faster, works offline, no server needed |
| Custom debounce | lodash.debounce | N/A | Obsidian's built-in has throttle behavior |
| fs.writeFile for notes | app.vault.create() | N/A | Triggers Obsidian indexing |

**Deprecated/outdated:**
- `obsidian-sqlite3` plugin dependency approach: Adds friction (two plugins needed)
- Storing full item metadata in registry: JSON becomes too large for 5000+ items

## Open Questions

1. **Zotero 7 schema version number**
   - What we know: Zotero 7 released with new features; schema likely updated
   - What's unclear: Exact version number for Zotero 7.x schema
   - Recommendation: Test with real Zotero 7 database during implementation; adjust VERSION check

2. **sql.js performance with 100MB+ databases**
   - What we know: sql.js loads entire database into memory
   - What's unclear: Performance with very large Zotero databases (10000+ items)
   - Recommendation: Benchmark during implementation; add progress indicator; consider pagination

3. **Citekey availability**
   - What we know: Better BibTeX stores citekeys in Zotero; need to find the exact field
   - What's unclear: Where Better BibTeX stores citekey in the database
   - Recommendation: Check itemData for "Citation Key" field; fall back to itemKey if not found

## Sources

### Primary (HIGH confidence)
- [Zotero Direct SQLite Database Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access) - Official read-only access documentation
- [Zotero GitHub Schema](https://github.com/zotero/zotero/blob/main/resource/schema/userdata.sql) - Current database schema
- [sql.js GitHub](https://github.com/sql-js/sql.js) - WebAssembly SQLite documentation
- [Zotero Data Directory](https://www.zotero.org/support/zotero_data) - Default paths by OS
- [Obsidian Plugin API](https://docs.obsidian.md/Reference/TypeScript+API/Plugin) - Official plugin documentation
- [SQLite WAL Mode](https://sqlite.org/wal.html) - Concurrent access documentation

### Secondary (MEDIUM confidence)
- [Obsidian Forum: SQLite Integration](https://forum.obsidian.md/t/adding-sqlite-database-integration-to-an-obsidian-plugin/88272) - Community solution for sql.js in Obsidian
- [Exploring Zotero Data Model](https://gist.github.com/pchemguy/19fa69fb4e74ef0cca0026aa0dbf5f42) - Detailed SQL queries for Zotero
- [Obsidian Plugin Developer Docs](https://marcusolsson.github.io/obsidian-plugin-docs/user-interface/settings) - Settings tab patterns

### Tertiary (LOW confidence)
- Zotero 7 schema changes: No official documentation found; needs empirical testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - sql.js verified in Obsidian community; official docs
- Architecture: HIGH - patterns from official Obsidian docs and successful plugins
- Pitfalls: HIGH - documented in Obsidian forum, Zotero docs, and SQLite docs
- SQL queries: MEDIUM - based on schema analysis; needs validation with real data

**Research date:** 2026-01-22
**Valid until:** 60 days (stable domain; Zotero schema changes are infrequent)
