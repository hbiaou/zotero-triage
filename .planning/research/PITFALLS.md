# Pitfalls Research: Progressive Zotero-Obsidian Bridge

**Domain:** Obsidian plugin with Zotero SQLite integration
**Researched:** 2026-01-22
**Project:** Card-based triage system for 5000+ item Zotero libraries

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or major architectural failures.

### Pitfall 1: UI Freezing During Batch Processing

**What goes wrong:**
Processing thousands of items synchronously blocks Obsidian's main thread, causing the entire UI to freeze. Users cannot interact with Obsidian for seconds or minutes.

**Why it happens:**
- Obsidian plugins run on the main UI thread
- Worker threads/Web Workers are NOT supported in Obsidian's plugin environment
- Large batch operations (5000+ items) executed without yielding control
- Synchronous SQLite queries for each item compound the problem

**Consequences:**
- Plugin appears to "hang" or crash Obsidian
- Users force-quit, potentially corrupting state
- Plugin gets disabled by frustrated users
- Negative reviews citing "freezes my vault"

**Real-world examples:**
- Smart Connections: Freezes Obsidian during indexing startup
- Omnisearch: Freezes when enabled on 8000+ note vaults
- Tasks plugin: "Does a huge amount of wasted work" during startup with open queries

**Prevention:**
1. **Use async/await with manual yielding:**
   ```typescript
   async function processLargeDataset(items: Item[]) {
     for (let i = 0; i < items.length; i++) {
       await processItem(items[i]);

       // Yield control every 10-50 items
       if (i % 10 === 0) {
         await sleep(0); // setImmediate equivalent
       }
     }
   }
   ```

2. **Batch with progress updates:**
   - Process in chunks of 50-100 items
   - Update UI progress indicator between chunks
   - Use `requestAnimationFrame()` or `setTimeout(fn, 0)` to yield

3. **Use `onLayoutReady()` for startup work:**
   - Don't block `onload()` with heavy processing
   - Defer expensive operations until UI is ready

4. **Implement cancellation:**
   - Allow users to cancel long-running operations
   - Store partial progress to resume later

**Detection warning signs:**
- Development testing with <100 items works fine
- Real users report "freezing" with larger datasets
- CPU usage spikes to 100% during operations
- Obsidian becomes unresponsive for >1 second

**Phase mapping:**
Phase 1 (Database Access): Test batch reading with simulated 5000 items early
Phase 2 (UI Processing): Implement chunked processing with yield points

**Confidence:** HIGH
**Sources:**
- [Obsidian plugin UI freezing issues](https://github.com/brianpetro/obsidian-smart-connections/issues/473)
- [Worker threads not supported](https://forum.obsidian.md/t/how-to-speed-up-cpu-intensive-tasks-in-an-obsidian-plugin-workers-not-supported/103392)
- [Large vault performance issues](https://forum.obsidian.md/t/call-for-plugin-performance-optimization-especially-for-plugin-startup/32321)

---

### Pitfall 2: SQLite Database Locking (Concurrent Access)

**What goes wrong:**
Attempting to read Zotero's SQLite database while Zotero is running results in `SQLITE_BUSY: database is locked` errors, preventing the plugin from functioning.

**Why it happens:**
- SQLite uses exclusive locks for write operations
- Zotero keeps database connections open while running
- Default journal mode doesn't support concurrent reads during writes
- Attempting to open database without proper flags

**Consequences:**
- Plugin fails silently or with error messages
- Users must close Zotero to use plugin (terrible UX)
- Race conditions between Zotero writes and plugin reads
- Potential database corruption if write operations attempted

**Official warning from Zotero:**
> "access to the SQLite database should be done only in a read-only manner. Modifying the database while Zotero is running can easily result in a corrupted database"

**Prevention:**

1. **Enable WAL (Write-Ahead Logging) mode:**
   - Zotero likely uses WAL mode for its database
   - WAL allows concurrent reads during writes: "Reading and writing can proceed concurrently"
   - Multiple readers can access simultaneously: "WAL journal mode supports one writer and many readers at the same time"

2. **Open database with immutable flag:**
   ```typescript
   // Read-only, non-locking access
   const db = new Database('zotero.sqlite', {
     readonly: true,
     fileMustExist: true
   });

   // Or use immutable mode if supported
   // When immutable is set, SQLite disables all locking
   ```

3. **Implement busy timeout and retry:**
   ```typescript
   db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds

   // Retry mechanism
   async function queryWithRetry(query, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await db.query(query);
       } catch (err) {
         if (err.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
           await sleep(1000 * (i + 1)); // Exponential backoff
           continue;
         }
         throw err;
       }
     }
   }
   ```

4. **Verify WAL mode is enabled:**
   ```sql
   PRAGMA journal_mode; -- Should return 'wal'
   ```

5. **Never attempt writes:**
   - Always open read-only
   - Never modify Zotero's database
   - Zotero's caching layer breaks normal file-locking

**Detection warning signs:**
- Intermittent `SQLITE_BUSY` errors
- Plugin works when Zotero is closed, fails when open
- Errors increase during Zotero sync operations
- Database corruption reports

**Phase mapping:**
Phase 1 (Database Access): First task is verifying concurrent read access works
Must test with Zotero actively syncing/modifying data

**Confidence:** HIGH
**Sources:**
- [Zotero direct database access documentation](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
- [SQLite WAL mode concurrent access](https://sqlite.org/wal.html)
- [Node.js SQLite locking issues](https://github.com/TryGhost/node-sqlite3/issues/1039)
- [Accessing Zotero SQLite with multiple clients](https://forums.zotero.org/discussion/19861/accessing-the-zotero-sqlite-db-with-multiple-clients)

---

### Pitfall 3: Zotero Schema Changes Breaking Integration

**What goes wrong:**
Zotero updates its SQLite schema between versions, causing direct database queries to fail with missing tables/columns or incorrect data structures.

**Why it happens:**
- Schema not guaranteed stable across versions
- New item types and fields added over time
- Database structure changes during major version upgrades (4→5, 5→6)
- No official schema versioning for external tools

**Consequences:**
- Plugin breaks after Zotero updates
- Queries return incorrect data or crash
- Users lose functionality without plugin updates
- Emergency patch releases required

**Official warning from Zotero:**
> "the SQLite database structure can change between Zotero releases"

**Real-world examples:**
- "[5.0 Beta] Database changes" forum discussion about breaking changes
- Users experiencing "database upgrade errors" when skipping versions
- Note storage schema changed in beta versions

**Prevention:**

1. **Query schema version at startup:**
   ```sql
   -- Check Zotero version from system table
   SELECT value FROM version WHERE schema='userdata';
   ```

2. **Use defensive queries:**
   ```typescript
   // Check if column exists before querying
   const columns = db.prepare(
     "PRAGMA table_info(items)"
   ).all();

   const hasColumn = columns.some(c => c.name === 'expectedColumn');

   if (!hasColumn) {
     // Handle missing column gracefully
     showNotice('Unsupported Zotero version. Please update plugin.');
     return;
   }
   ```

3. **Version compatibility matrix:**
   - Document tested Zotero versions
   - Warn users about untested versions
   - Provide graceful degradation for older schemas

4. **Test against multiple Zotero versions:**
   - Keep VM/containers with different Zotero versions
   - Test schema assumptions before each release
   - Monitor Zotero-dev Google group for schema changes

5. **Focus on stable tables:**
   - Core tables (items, creators, collections) change less
   - Attachment paths and notes more volatile
   - Avoid querying internal/undocumented tables

6. **Never modify the database:**
   - Read-only prevents sync breaking
   - Schema modifications "will break Zotero sync and may break many parts of Zotero functionality"

**Detection warning signs:**
- SQL errors after Zotero updates
- Missing columns/tables errors
- Data appears corrupt or incomplete
- Users report "worked until I updated Zotero"

**Phase mapping:**
Phase 1: Implement schema version detection
Phase 1: Build compatibility layer for known versions
Post-MVP: Automated testing against Zotero beta versions

**Confidence:** HIGH
**Sources:**
- [Zotero 5.0 Beta database changes](https://forums.zotero.org/discussion/65699/5-0-beta-database-changes)
- [Zotero database schema changes documentation](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
- [Database schema changes in beta](https://forums.zotero.org/discussion/111818/did-the-db-schema-for-item-notes-storing-changed-in-new-beta)

---

### Pitfall 4: JSON State Corruption from Concurrent Writes

**What goes wrong:**
Multiple operations attempt to save plugin state simultaneously, resulting in corrupted JSON files, lost state, or only partial state persistence.

**Why it happens:**
- `saveData()` is async but not atomic
- No locking mechanism prevents concurrent writes
- Race conditions between user actions and auto-save
- JavaScript event loop allows interleaved operations
- File write interrupted by Obsidian crash/force-quit

**Consequences:**
- User loses triage progress (worst case)
- State file becomes unparseable JSON
- Plugin enters invalid state on restart
- Users must manually delete data.json to recover

**Real-world patterns:**
- User clicks "process item" rapidly
- Auto-save triggered while manual save in progress
- Obsidian crashes mid-write
- Multiple state updates queued without debouncing

**Prevention:**

1. **Implement save queue with debouncing:**
   ```typescript
   class StateManager {
     private saveTimeout: NodeJS.Timeout | null = null;
     private isSaving = false;
     private pendingSave = false;

     async saveState(state: State) {
       // Debounce rapid saves
       if (this.saveTimeout) {
         clearTimeout(this.saveTimeout);
       }

       this.saveTimeout = setTimeout(async () => {
         await this.performSave(state);
       }, 1000); // Wait 1 second of inactivity
     }

     private async performSave(state: State) {
       // Prevent concurrent saves
       if (this.isSaving) {
         this.pendingSave = true;
         return;
       }

       this.isSaving = true;
       try {
         await this.plugin.saveData(state);

         if (this.pendingSave) {
           this.pendingSave = false;
           await this.performSave(state);
         }
       } finally {
         this.isSaving = false;
       }
     }
   }
   ```

2. **Use atomic write pattern (write-then-rename):**
   - Unfortunately, Obsidian's `saveData()` doesn't expose this
   - Use Obsidian's built-in method, trust its atomicity
   - Or use Vault API with temp files

3. **Implement state versioning and validation:**
   ```typescript
   interface PersistedState {
     version: number;
     lastModified: number;
     checksum?: string;
     data: YourState;
   }

   async loadState(): Promise<YourState> {
     const loaded = await this.loadData();

     // Validate structure
     if (!loaded || !loaded.version || !loaded.data) {
       console.error('Corrupted state, using defaults');
       return DEFAULT_STATE;
     }

     // Version migration if needed
     if (loaded.version < CURRENT_VERSION) {
       return this.migrateState(loaded);
     }

     return loaded.data;
   }
   ```

4. **Keep backups of previous state:**
   ```typescript
   async saveState(state: State) {
     // Backup previous state
     const current = await this.loadData();
     if (current) {
       await this.saveData({
         ...current,
         _backup: current.data
       });
     }

     // Save new state
     await this.saveData({
       version: STATE_VERSION,
       lastModified: Date.now(),
       data: state
     });
   }
   ```

5. **Validate JSON before save:**
   ```typescript
   // Ensure state is serializable
   try {
     JSON.parse(JSON.stringify(state));
   } catch (err) {
     console.error('State not serializable', err);
     // Don't save corrupted state
     return;
   }
   ```

**Detection warning signs:**
- Users report "lost my progress"
- JSON parse errors on plugin load
- State resets to defaults unexpectedly
- Partial state (some fields missing)

**Phase mapping:**
Phase 2: Implement state management with queue from start
Phase 2: Add state validation and recovery before heavy usage
Phase 3: Add state backup/recovery UI for user peace of mind

**Confidence:** MEDIUM-HIGH
**Sources:**
- [React race conditions in state management](https://medium.com/@sassenthusiast/managing-local-and-cloud-data-in-react-a-guide-to-avoiding-race-conditions-f83780a1951e)
- [JavaScript async race conditions](https://medium.com/@slavik57/async-race-conditions-in-javascript-526f6ed80665)
- [Obsidian plugin data persistence](https://marcusolsson.github.io/obsidian-plugin-docs/user-interface/settings)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

### Pitfall 5: Memory Leaks with Large Datasets

**What goes wrong:**
Processing 5000+ items accumulates objects in memory without cleanup, eventually causing "JavaScript heap out of memory" errors or severe performance degradation.

**Why it happens:**
- Closures capture large objects unintentionally
- DOM elements retained after removal
- Event listeners not cleaned up
- Large arrays/objects not dereferenced after use
- Timers/intervals running indefinitely

**Consequences:**
- Plugin slows down over time
- Obsidian becomes sluggish
- Eventually crashes with OOM error
- Users must restart Obsidian frequently

**Prevention:**

1. **Process in batches and clear:**
   ```typescript
   async function processBatches(items: Item[]) {
     const BATCH_SIZE = 100;

     for (let i = 0; i < items.length; i += BATCH_SIZE) {
       const batch = items.slice(i, i + BATCH_SIZE);
       await processBatch(batch);

       // Clear batch reference
       batch.length = 0;

       // Force GC opportunity
       await sleep(0);
     }
   }
   ```

2. **Clean up event listeners:**
   ```typescript
   onload() {
     this.registerEvent(
       this.app.workspace.on('event', this.handler)
     );
     // Obsidian cleans up registered events automatically
   }

   // Don't do this:
   window.addEventListener('event', this.handler);
   // Must manually remove in onunload()
   ```

3. **Avoid capturing large objects in closures:**
   ```typescript
   // Bad - captures entire array
   items.forEach(item => {
     setTimeout(() => {
       process(item); // Closure captures 'items'
     }, 1000);
   });

   // Good - only captures needed data
   items.forEach(item => {
     const itemData = { id: item.id, title: item.title };
     setTimeout(() => {
       process(itemData);
     }, 1000);
   });
   ```

4. **Clear DOM references:**
   ```typescript
   class CardView {
     private cards: HTMLElement[] = [];

     destroy() {
       // Remove from DOM
       this.cards.forEach(card => card.remove());

       // Clear array
       this.cards = [];

       // Clear any stored references
       this.cards.length = 0;
     }
   }
   ```

5. **Monitor memory usage during development:**
   - Use Chrome DevTools memory profiler
   - Check for growing heap over multiple operations
   - Take heap snapshots before/after batch operations

**Detection warning signs:**
- Memory usage grows continuously
- Performance degrades over time
- "Out of memory" errors
- Obsidian becomes unresponsive after processing many items

**Phase mapping:**
Phase 2: Implement batch processing with cleanup
Phase 3: Load test with 5000+ items, monitor memory
Phase 3: Add memory profiling to test suite

**Confidence:** MEDIUM-HIGH
**Sources:**
- [Batch processing large datasets Node.js](https://dev.to/rabindratamang/batch-processing-large-datasets-in-nodejs-without-running-out-of-memory-9a1)
- [JavaScript memory leaks types](https://auth0.com/blog/four-types-of-leaks-in-your-javascript-code-and-how-to-get-rid-of-them/)
- [Queue system memory leaks](https://github.com/OptimalBits/bull/issues/277)

---

### Pitfall 6: Ignoring Cross-Platform File Path Differences

**What goes wrong:**
Plugin works perfectly on developer's OS (Windows) but fails on Mac/Linux due to hard-coded path separators or absolute paths stored in state.

**Why it happens:**
- Windows uses `\` (and `C:\`), Unix uses `/`
- Zotero uses different attachment base paths per OS
- Storing absolute paths in persistent state
- Not using Node.js path utilities

**Consequences:**
- Attachments fail to load on different OS
- File links break when syncing across devices
- User reports "works on Windows, broken on Mac"
- Difficult to reproduce and debug

**Zotero-specific context:**
Zotero supports "Linked Attachment Base Directory" for relative paths:
- Mac: `/Users/Sarah/Dropbox/PDFs`
- Windows: `C:\Users\Sarah\Dropbox\PDFs`
- Same relative path works on both if base directory set

**Prevention:**

1. **Always use Node.js `path` module:**
   ```typescript
   import { join, normalize, basename } from 'path';

   // Don't do this:
   const filePath = baseDir + '\\' + filename; // Windows-only

   // Do this:
   const filePath = join(baseDir, filename); // Cross-platform
   ```

2. **Store relative paths in state:**
   ```typescript
   // Bad - absolute path
   state.attachmentPath = 'C:\\Users\\...\\file.pdf';

   // Good - relative to Zotero base or vault
   state.attachmentPath = 'storage/ABC123/file.pdf';
   ```

3. **Query Zotero's base directory setting:**
   ```sql
   -- Get Linked Attachment Base Directory
   SELECT value FROM settings
   WHERE key='baseAttachmentPath';
   ```

4. **Handle both attachment types:**
   - Stored attachments: In `storage/{itemKey}/` directory
   - Linked attachments: Relative to base directory (if set)

5. **Normalize paths from database:**
   ```typescript
   // Zotero may store with forward slashes
   const normalizedPath = normalize(pathFromDb);
   ```

**Detection warning signs:**
- Mac/Linux users report attachment loading failures
- Path-related errors on non-Windows systems
- Syncing vault between OSes breaks paths
- Can't reproduce issues on developer machine

**Phase mapping:**
Phase 1: Use path utilities from first database query
Phase 2: Test on Windows, Mac, Linux before release
Phase 2: Add CI tests on multiple platforms

**Confidence:** MEDIUM
**Sources:**
- [Zotero relative paths cross-platform](https://www.zotero.org/support/preferences/advanced)
- [Zotero linked attachment base directory](https://forums.zotero.org/discussion/83514/issue-with-file-links-with-relative-paths)

---

### Pitfall 7: Not Handling Zotero Database Location Discovery

**What goes wrong:**
Plugin assumes Zotero database is in default location, fails for users with custom data directories or multiple profiles.

**Why it happens:**
- Hard-coding default paths
- Not checking Zotero profile configuration
- Assuming single Zotero installation
- Not handling portable Zotero installations

**Consequences:**
- Plugin can't find database
- Fails silently or with cryptic errors
- Users with custom setups can't use plugin
- Support burden explaining manual path configuration

**Prevention:**

1. **Check multiple default locations:**
   ```typescript
   const possiblePaths = [
     // Windows
     join(process.env.APPDATA, 'Zotero', 'Zotero', 'zotero.sqlite'),
     // Mac
     join(process.env.HOME, 'Zotero', 'zotero.sqlite'),
     // Linux
     join(process.env.HOME, '.zotero', 'zotero', 'zotero.sqlite')
   ];

   for (const path of possiblePaths) {
     if (await exists(path)) {
       return path;
     }
   }
   ```

2. **Read Zotero profiles configuration:**
   ```typescript
   // Zotero stores profile info in profiles.ini
   // Windows: %APPDATA%\Zotero\Zotero\profiles.ini
   // Mac: ~/Library/Application Support/Zotero/profiles.ini
   ```

3. **Provide manual path setting:**
   - Settings tab with file picker
   - Validate path exists and is SQLite database
   - Show clear error if invalid

4. **Auto-detect and confirm:**
   - Try auto-detection first
   - Show found path in settings
   - Let user override if incorrect

5. **Handle multiple profiles:**
   - Zotero supports multiple profiles
   - Let user select which profile if multiple found

**Detection warning signs:**
- "Database not found" errors
- Works for some users, not others
- Users with portable/custom Zotero installations report failures

**Phase mapping:**
Phase 1: Implement path discovery first sprint
Phase 1: Add manual path override in settings
Phase 2: Test with non-default installations

**Confidence:** MEDIUM
**Sources:**
- [Zotero data directory locations](https://www.zotero.org/support/zotero_data)
- [Zotero profiles documentation](https://www.zotero.org/support/kb/profile_directory)

---

### Pitfall 8: Startup Performance Impact on Obsidian

**What goes wrong:**
Plugin performs heavy initialization during `onload()`, causing Obsidian startup to take 10-30 seconds longer, frustrating users.

**Why it happens:**
- Loading and processing entire database on startup
- Indexing operations in `onload()` instead of deferred
- Not using `onLayoutReady()` for heavy work
- Blocking initialization instead of lazy loading

**Consequences:**
- Users report "slow startup"
- Plugin gets disabled to improve startup time
- Negative reviews citing performance
- Obsidian startup time overlay flags plugin

**Real-world example:**
- Lazy Plugin Loader created specifically to delay plugin loading
- Omnisearch freezes during indexing on large vaults
- Tasks plugin redrawing results for every file at startup

**Prevention:**

1. **Defer heavy work to `onLayoutReady()`:**
   ```typescript
   async onload() {
     // Only essential setup here
     await this.loadSettings();
     this.addRibbonIcon('...', '...', () => {});

     // Don't process data yet
     this.registerEvent(
       this.app.workspace.on('layout-ready', () => {
         this.initializeDataProcessing();
       })
     );
   }

   async initializeDataProcessing() {
     // Heavy work after UI is ready
     await this.loadZoteroData();
   }
   ```

2. **Lazy load database connection:**
   ```typescript
   // Don't connect to database until first use
   private dbConnection: Database | null = null;

   async getDatabase(): Promise<Database> {
     if (!this.dbConnection) {
       this.dbConnection = await this.connectToZotero();
     }
     return this.dbConnection;
   }
   ```

3. **Show progress for slow operations:**
   - If initialization takes >1 second, show notice
   - "Loading Zotero data..."
   - Don't leave users wondering if something broke

4. **Cache processed data:**
   - Don't reprocess on every startup
   - Cache metadata, only fetch new/changed items
   - Store last sync timestamp

5. **Provide startup behavior settings:**
   - "Load Zotero data on startup" (on/off)
   - "Auto-sync on startup" (on/off)
   - Let users choose performance vs. convenience

**Detection warning signs:**
- Startup time overlay shows plugin >1 second
- Users report "Obsidian takes forever to start"
- Plugin ranks high in startup time metrics

**Phase mapping:**
Phase 1: Design for lazy loading from start
Phase 2: Test startup time before each release
Phase 3: Add caching/incremental sync to reduce load

**Confidence:** HIGH
**Sources:**
- [Plugin startup performance optimization](https://forum.obsidian.md/t/call-for-plugin-performance-optimization-especially-for-plugin-startup/32321)
- [Lazy Plugin Loader](https://forum.obsidian.md/t/new-plugin-make-your-obsidian-start-up-super-fast/87627)
- [Plugins with heavy startup work](https://forum.obsidian.md/t/plugins-with-a-lot-to-do-at-startup-being-async-onlayoutready/26205)

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily fixable.

### Pitfall 9: Not Validating Plugin Settings on Load

**What goes wrong:**
Corrupted or manually edited settings cause plugin to fail on startup with cryptic errors.

**Why it happens:**
- Assuming settings have valid structure
- Not providing defaults for missing fields
- User manually edits data.json incorrectly
- Settings schema changes between versions

**Consequences:**
- Plugin fails to load
- Errors not helpful for debugging
- User must delete data.json manually
- Support tickets: "Plugin won't load"

**Prevention:**

1. **Always merge with defaults:**
   ```typescript
   async loadSettings() {
     const loaded = await this.loadData();
     this.settings = Object.assign(
       {},
       DEFAULT_SETTINGS,
       loaded
     );
   }
   ```

2. **Validate loaded data:**
   ```typescript
   async loadSettings() {
     const loaded = await this.loadData();

     // Validate structure
     if (loaded && typeof loaded.zoteroPath !== 'string') {
       console.warn('Invalid zoteroPath, using default');
       loaded.zoteroPath = DEFAULT_SETTINGS.zoteroPath;
     }

     this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
   }
   ```

3. **Graceful degradation for invalid settings:**
   - Show notice: "Settings corrupted, using defaults"
   - Don't crash, just warn
   - Allow user to reconfigure

**Phase mapping:**
Phase 1: Implement from first settings implementation

**Confidence:** HIGH
**Sources:**
- [Obsidian settings best practices](https://marcusolsson.github.io/obsidian-plugin-docs/user-interface/settings)

---

### Pitfall 10: Forgetting to Clean Up Resources in `onunload()`

**What goes wrong:**
Plugin disabled or Obsidian closed, but resources (timers, intervals, event listeners) keep running or aren't properly cleaned up.

**Why it happens:**
- Not tracking all created resources
- Forgetting to implement cleanup
- Assuming Obsidian cleans up everything
- External event listeners not removed

**Consequences:**
- Memory leaks
- Errors after plugin disabled
- Timers fire after unload
- Resource contention

**Prevention:**

1. **Use Obsidian's registration methods:**
   ```typescript
   onload() {
     // These are auto-cleaned up
     this.registerEvent(...);
     this.registerDomEvent(...);
     this.registerInterval(...);
   }
   ```

2. **Manually track what needs cleanup:**
   ```typescript
   private timers: NodeJS.Timeout[] = [];
   private dbConnection: Database | null = null;

   onunload() {
     // Clear timers
     this.timers.forEach(t => clearTimeout(t));
     this.timers = [];

     // Close database
     this.dbConnection?.close();
     this.dbConnection = null;
   }
   ```

**Phase mapping:**
Phase 1: Implement `onunload()` alongside `onload()`

**Confidence:** HIGH

---

### Pitfall 11: Inconsistent Error Handling and User Feedback

**What goes wrong:**
Errors fail silently, or show technical stack traces, leaving users confused about what went wrong.

**Why it happens:**
- Not catching exceptions in async operations
- Showing raw error messages to users
- No user-friendly error explanations
- Silent failures in background operations

**Consequences:**
- Users don't know why plugin isn't working
- Support burden explaining errors
- "Plugin doesn't work" reports without details

**Prevention:**

1. **User-friendly error messages:**
   ```typescript
   try {
     await this.loadZoteroDatabase();
   } catch (err) {
     new Notice(
       'Could not connect to Zotero database. ' +
       'Please check Settings → Zotero path.',
       10000
     );
     console.error('Zotero connection error:', err);
   }
   ```

2. **Provide actionable guidance:**
   - Tell users what to do to fix it
   - Link to settings or documentation
   - Don't just say "Error occurred"

3. **Log details for debugging:**
   - User-friendly message in Notice
   - Technical details in console.error
   - Include error context (what operation failed)

**Phase mapping:**
Phase 1: Establish error handling patterns early

**Confidence:** HIGH

---

### Pitfall 12: Not Testing with Empty/Minimal Zotero Libraries

**What goes wrong:**
Plugin assumes data exists (items, collections, attachments), crashes with empty or new Zotero libraries.

**Why it happens:**
- Testing only with developer's full library
- Not handling empty query results
- Assuming at least one collection exists

**Consequences:**
- New Zotero users can't use plugin
- Array access errors on empty results
- Division by zero in progress calculations

**Prevention:**

1. **Test with empty library:**
   - Create test profile with 0 items
   - Create test profile with 1 item
   - Test all code paths with empty results

2. **Check for empty results:**
   ```typescript
   const items = db.prepare('SELECT * FROM items').all();

   if (items.length === 0) {
     new Notice('No items found in Zotero library');
     return;
   }
   ```

3. **Provide helpful onboarding:**
   - If empty, show "Add items to Zotero first"
   - Link to Zotero getting started guide

**Phase mapping:**
Phase 2: Add empty library tests before release

**Confidence:** MEDIUM

---

## Performance Pitfalls Summary

For a plugin processing 5000+ items:

| Operation | Pitfall | Prevention |
|-----------|---------|------------|
| **Batch reading** | UI freeze | Chunk processing, yield every 50 items |
| **Memory usage** | Heap overflow | Clear references, process in batches <100 |
| **Startup time** | 10s+ delay | Lazy load, use `onLayoutReady()` |
| **Database access** | SQLITE_BUSY | Read-only, WAL mode, retry logic |
| **State persistence** | Corruption | Debounce saves, validate on load |

---

## Zotero-Specific Pitfall Summary

| Area | Pitfall | Prevention |
|------|---------|------------|
| **Database access** | Locking, corruption | Read-only, never write, WAL mode |
| **Schema changes** | Breaking updates | Version detection, defensive queries |
| **Attachments** | Wrong paths | Use relative paths, cross-platform path utilities |
| **Collections** | Recursive queries | Understand collections/subcollections structure |
| **Integration** | Conflicts with other plugins | Test with Better BibTeX, ZotFile |

---

## Phase-Specific Warnings

| Phase | Likely Pitfalls | Mitigation |
|-------|----------------|------------|
| **Phase 1: Database Access** | SQLite locking, schema changes, path discovery | Test concurrent access with Zotero running, implement version detection, test on all OSes |
| **Phase 2: UI/Processing** | UI freezing, memory leaks, state corruption | Implement chunked processing from start, add debounced state saves, load test with 5000 items |
| **Phase 3: Quality Gates** | Slow processing blocking gates | Ensure async processing doesn't block, test gate performance with large datasets |
| **Phase 4: Polish** | Startup performance, error handling | Profile startup time, add user-friendly errors, test edge cases |

---

## Detection Checklist

Before each release, verify:

- [ ] Tested with 5000+ items without UI freeze
- [ ] Tested with Zotero running and actively syncing
- [ ] Tested on Windows, Mac, Linux
- [ ] Tested with empty Zotero library
- [ ] Tested with custom Zotero data directory
- [ ] Startup time <1 second in Obsidian overlay
- [ ] Memory usage stable after multiple operations
- [ ] State persists correctly across restarts
- [ ] No SQLite locking errors under load
- [ ] Graceful handling of schema version mismatches
- [ ] All errors show user-friendly messages
- [ ] Settings validated on load
- [ ] Resources cleaned up in `onunload()`

---

## Monitoring Red Flags

If users report these, investigate immediately:

- "Freezes my vault" → UI blocking issue
- "Lost my progress" → State corruption issue
- "Works when Zotero closed" → Database locking issue
- "Database locked" errors → Concurrent access issue
- "Slows down over time" → Memory leak issue
- "Takes forever to start" → Startup performance issue
- "Works on Windows, not Mac" → Path handling issue
- "Stopped working after Zotero update" → Schema change issue

---

## Resources for Deeper Research

**Official Documentation:**
- [Zotero Direct SQLite Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [SQLite WAL Mode](https://sqlite.org/wal.html)

**Community Resources:**
- [Obsidian Plugin Developer Docs](https://marcusolsson.github.io/obsidian-plugin-docs/)
- [Zotero Forums](https://forums.zotero.org/)
- [Zotero-dev Google Group](https://groups.google.com/g/zotero-dev)

**Similar Projects to Study:**
- [Obsidian-Zotero Integration](https://github.com/mgmeyers/obsidian-zotero-integration) (uses Zotero API, not direct DB)
- [Better BibTeX](https://github.com/retorquere/zotero-better-bibtex) (Zotero plugin with performance lessons)
- [Obsidian Dataview](https://github.com/blacksmithgu/obsidian-dataview) (large dataset processing patterns)

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|-----------|---------|
| **UI Freezing** | HIGH | Multiple real-world examples, clear patterns |
| **SQLite Locking** | HIGH | Official docs + multiple source confirmation |
| **Schema Changes** | HIGH | Official warning + forum discussions |
| **State Corruption** | MEDIUM | Common pattern but less domain-specific examples |
| **Memory Leaks** | MEDIUM-HIGH | General JavaScript issue, applies to large datasets |
| **Path Handling** | MEDIUM | Documented in Zotero, standard cross-platform issue |
| **Startup Performance** | HIGH | Obsidian-specific issue, well-documented |
| **Minor Pitfalls** | HIGH | Standard plugin development practices |

---

## Summary

The most critical pitfalls for this project are:

1. **UI freezing** - Will immediately cause user complaints. Implement chunked processing from day 1.

2. **SQLite database locking** - Must verify concurrent read access works with Zotero running. This is make-or-break.

3. **Schema changes** - Zotero schema not stable. Implement version detection early, expect to update queries.

4. **State corruption** - With 5000+ items, state management is critical. Users lose trust if progress disappears.

These four pitfalls should drive architecture decisions in Phase 1 and have dedicated tests before MVP release.
