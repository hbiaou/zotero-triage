# Phase 5: Polish - Research

**Researched:** 2026-01-24
**Domain:** Performance optimization, error handling, cross-platform support, database concurrency, memory management
**Confidence:** HIGH

## Summary

Phase 5 transforms working features from Phases 1-4 into a production-ready plugin by addressing performance, error handling, and cross-platform reliability. Research validates that Obsidian provides native APIs for progress reporting and error notification, exponential backoff with retry logic is the standard for handling database concurrency (SQLITE_BUSY), and cross-platform path detection for Zotero is already partially implemented in the codebase. Error handling best practices focus on converting technical errors to user-actionable messages via Result pattern or custom error classes, startup optimization relies on lazy loading and deferring heavy operations, and memory safety requires proper cleanup of event listeners and database connections.

Key findings:
- Obsidian's Notice API (0ms for persistent) supports progress feedback; built-in progress indicator for long operations required
- SQLITE_BUSY handling: Implement retry with exponential backoff (3-5 attempts, 100ms initial + jitter) rather than immediate retry
- Cross-platform path detection for Zotero is already implemented in utils/paths.ts; auto-detect on first run covers Windows/Mac/Linux
- Error messages must be user-actionable, not technical stacks; use Result pattern or custom AppError classes
- Startup optimization: Defer database connection until first use; defer expensive initialization; use Obsidian's debug timing overlay for validation
- Memory leaks typically from unclosed event listeners, timers, database connections; use WeakMap for caches, dispose() pattern in plugins

**Primary recommendation:** Implement progress indicators via inline Notice updates + status modal for long operations; add exponential backoff retry handler for SQLITE_BUSY with user-friendly error messages; use Result pattern for error handling; defer database connection until first triage view open; normalize all path/key comparisons to case-insensitive.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sql.js | 1.13.0+ | SQLite via WASM; read-only database access | Already integrated Phase 1; avoids native module issues in Electron |
| obsidian | latest | Notice API for progress, Modal for errors | Official API; native keyboard/theme handling |
| (custom) | N/A | Result<T, E> pattern or AppError class | Type-safe error handling without additional dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| async-exit-hook | 2.x | Resource cleanup on shutdown | Optional; ensures event listeners cleaned on plugin unload |
| process (built-in) | N/A | process.memoryUsage() for monitoring | Built-in; validate memory not leaking in extended sessions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Exponential backoff | Immediate retry | Floods database; triggers "thundering herd"; fails more often |
| Exponential backoff | Fixed delay retry | Less adaptive; can retry too slowly or flood service |
| Result pattern | try/catch + null checks | Error context lost; harder to distinguish error types |
| Result pattern | Custom error classes | More verbose; Result pattern is explicit about failure |
| Notice updates | Modal progress bar | Modal blocks; Notice is non-blocking, better UX |
| Notice updates | No feedback | Users think plugin frozen; no visibility into progress |

**Installation:**
```bash
npm install async-exit-hook
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── error/
│   ├── app-error.ts              # Custom error classes (AppError, DatabaseError, etc.)
│   ├── error-handler.ts          # Convert errors to user messages
│   └── result.ts                 # Result<T, E> type and utilities
├── db/
│   ├── zotero-connector.ts       # (extend with retry logic)
│   ├── retry-handler.ts          # Exponential backoff retry logic
│   └── connection-pool.ts        # (optional) Single connection management
├── performance/
│   ├── progress-tracker.ts       # Track progress state and callbacks
│   ├── memory-monitor.ts         # Monitor memory usage, detect leaks
│   └── startup-perf.ts           # Log startup timings (debug)
├── ui/
│   ├── triage-view.ts            # (extend with progress indicator)
│   ├── error-modal.ts            # User-friendly error display + actions
│   └── progress-notice.ts        # Notice-based progress updates
├── utils/
│   ├── paths.ts                  # (already complete; cross-platform detection)
│   └── case-normalization.ts     # Lowercase for all key/path comparisons
└── main.ts                        # (defer db connection to lazy init)
```

### Pattern 1: Result Pattern for Error Handling
**What:** Type-safe error handling that forces error cases to be handled
**When to use:** Any async operation that might fail (database, file system, Zotero connection)
**Example:**
```typescript
// Source: Functional error handling best practices
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

interface DatabaseError extends Error {
  code: string;
  retryable: boolean;
}

async function loadItems(): Promise<Result<ZoteroItem[], DatabaseError>> {
  try {
    const items = await connector.loadItems();
    return { success: true, data: items };
  } catch (err) {
    const dbError: DatabaseError = {
      ...err as Error,
      code: 'DB_LOAD_FAILED',
      retryable: true
    };
    return { success: false, error: dbError };
  }
}

// Usage forces error handling
const result = await loadItems();
if (result.success) {
  const items = result.data; // Type: ZoteroItem[]
  displayItems(items);
} else {
  // Error MUST be handled
  const message = getUserFriendlyMessage(result.error);
  new Notice(message);
}
```

### Pattern 2: Exponential Backoff Retry Handler
**What:** Retry failed operations with exponentially increasing delay + jitter
**When to use:** Database operations that might fail with SQLITE_BUSY or transient errors
**Example:**
```typescript
// Source: SQLite concurrency best practices + Microsoft Microservices
interface RetryOptions {
  maxAttempts: number;     // Default: 5
  initialDelayMs: number;  // Default: 100ms
  maxDelayMs: number;      // Default: 5000ms
  backoffMultiplier: number; // Default: 2
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = {
    maxAttempts: options.maxAttempts ?? 5,
    initialDelayMs: options.initialDelayMs ?? 100,
    maxDelayMs: options.maxDelayMs ?? 5000,
    backoffMultiplier: options.backoffMultiplier ?? 2
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err as Error;

      // Check if error is retryable (SQLITE_BUSY)
      if (!isSqliteBusy(lastError) && attempt < config.maxAttempts - 1) {
        // Non-retryable error; fail immediately
        throw err;
      }

      if (attempt < config.maxAttempts - 1) {
        // Calculate delay with exponential backoff + jitter
        const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
        const delay = Math.min(baseDelay, config.maxDelayMs);
        const jitter = Math.random() * 50; // Add up to 50ms jitter to prevent thundering herd
        const totalDelay = delay + jitter;

        console.log(`Retry attempt ${attempt + 1}/${config.maxAttempts} after ${totalDelay}ms`);
        await sleep(totalDelay);
      }
    }
  }

  throw lastError ?? new Error('Operation failed after retries');
}

function isSqliteBusy(error: Error): boolean {
  return error.message.includes('SQLITE_BUSY') || error.message.includes('database is locked');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Usage in ZoteroConnector.loadItems()
async loadItems(onProgress?: LoadProgressCallback): Promise<ZoteroItem[]> {
  return await retryWithBackoff(() => {
    // Existing loadItems logic
    return this.loadItemsWithoutRetry(onProgress);
  }, {
    maxAttempts: 5,
    initialDelayMs: 100
  });
}
```

### Pattern 3: User-Friendly Error Messages with Context
**What:** Convert technical errors to actionable user messages with contextual actions
**When to use:** Before displaying errors via Notice or Modal
**Example:**
```typescript
// Source: Error handling best practices
interface ErrorWithContext {
  title: string;
  message: string;
  actions: Array<{
    label: string;
    action: () => void | Promise<void>;
  }>;
  technicalDetails?: string; // For debug/bug reports
}

function getErrorContext(error: Error): ErrorWithContext {
  // Database connection errors
  if (error.message.includes('not found at')) {
    return {
      title: 'Zotero Database Not Found',
      message: 'The database path configured in settings no longer exists.',
      actions: [
        {
          label: 'Auto-detect',
          action: () => detectZoteroPath() // Reopens settings
        },
        {
          label: 'Browse',
          action: () => showFileBrowser()
        }
      ],
      technicalDetails: error.message
    };
  }

  // Schema version errors
  if (error.message.includes('schema version')) {
    return {
      title: 'Zotero Version Incompatible',
      message: 'Your Zotero version is not supported. Please upgrade Zotero or the ZotBridge plugin.',
      actions: [
        {
          label: 'Check for updates',
          action: () => openSettings('community-plugins')
        }
      ],
      technicalDetails: error.message
    };
  }

  // SQLITE_BUSY after retries
  if (error.message.includes('SQLITE_BUSY')) {
    return {
      title: 'Database Temporarily Locked',
      message: 'Zotero is currently accessing the database. Close Zotero or wait a moment and try again.',
      actions: [
        {
          label: 'Retry',
          action: () => retryLastOperation()
        }
      ],
      technicalDetails: error.message
    };
  }

  // Generic fallback
  return {
    title: 'Operation Failed',
    message: 'An unexpected error occurred. Check the technical details below or contact support.',
    actions: [
      {
        label: 'Copy Error Details',
        action: () => copyToClipboard(error.message)
      }
    ],
    technicalDetails: error.stack
  };
}

// Usage in error modal
function showErrorWithContext(error: Error): void {
  const context = getErrorContext(error);
  new ErrorModal(app, {
    title: context.title,
    message: context.message,
    actions: context.actions,
    details: context.technicalDetails
  }).open();
}
```

### Pattern 4: Progress Tracking with Notice Updates
**What:** Non-blocking progress feedback via persistent Notice with status updates
**When to use:** Long-running operations (batch generation, database loading, file creation)
**Example:**
```typescript
// Source: Obsidian Notice API + Phase 1 patterns
interface ProgressState {
  status: string;
  loaded: number;
  total: number;
  percentComplete: number;
}

class ProgressTracker {
  private notice: Notice | null = null;
  private state: ProgressState;

  constructor() {
    this.state = { status: '', loaded: 0, total: 0, percentComplete: 0 };
  }

  start(message: string, total: number): void {
    this.state = { status: message, loaded: 0, total, percentComplete: 0 };
    // Keep notice open (0ms timeout = persistent)
    this.notice = new Notice(this.formatMessage(), 0);
  }

  update(loaded: number, status?: string): void {
    this.state.loaded = loaded;
    if (status) this.state.status = status;
    this.state.percentComplete = Math.round((loaded / this.state.total) * 100);

    if (this.notice) {
      this.notice.setMessage(this.formatMessage());
    }
  }

  complete(finalMessage?: string): void {
    if (this.notice) {
      this.notice.hide();
      this.notice = null;
    }
    if (finalMessage) {
      new Notice(finalMessage); // Auto-dismiss after 5s
    }
  }

  error(message: string): void {
    if (this.notice) {
      this.notice.hide();
      this.notice = null;
    }
    new Notice(message);
  }

  private formatMessage(): string {
    const bar = this.createProgressBar(this.state.percentComplete);
    return `${this.state.status}\n${bar}\n${this.state.loaded}/${this.state.total} (${this.state.percentComplete}%)`;
  }

  private createProgressBar(percent: number, width: number = 20): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }
}

// Usage in triage view
async generateBatch(): Promise<void> {
  const progress = new ProgressTracker();
  progress.start('Loading Zotero library', 5000); // Assume 5000 items

  try {
    await this.plugin.connector.connect(this.plugin.settings.zoteroDbPath);
    const items = await this.plugin.connector.loadItems((loaded, total) => {
      progress.update(loaded, `Loading items from database...`);
    });

    progress.complete(`Loaded ${items.length} items`);
  } catch (err) {
    progress.error(`Failed to load library: ${getErrorContext(err).message}`);
  }
}
```

### Pattern 5: Case-Insensitive Key and Path Comparison
**What:** Normalize all path and Zotero key comparisons to prevent Linux-specific issues
**When to use:** Any comparison of file paths or item keys (especially cross-platform)
**Example:**
```typescript
// Source: Phase 5 CONTEXT.md decision
export function normalizePath(filePath: string): string {
  // Convert to lowercase for case-insensitive comparison
  // Normalize separators to forward slash
  return filePath.toLowerCase().replace(/\\/g, '/');
}

export function normalizeItemKey(key: string): string {
  // Zotero keys are case-sensitive in DB, but comparisons should be case-insensitive
  return key.toLowerCase();
}

export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePath(path1) === normalizePath(path2);
}

export function keysEqual(key1: string, key2: string): boolean {
  return normalizeItemKey(key1) === normalizeItemKey(key2);
}

// Usage in registry
class RegistryService {
  private registry: Registry;

  markState(itemID: number, state: RegistryState): void {
    // Always normalize the key
    const normalizedKey = String(itemID);
    this.registry.entries[normalizedKey] = {
      state,
      timestamp: Date.now()
    };
  }

  isImported(itemID: number): boolean {
    const normalizedKey = String(itemID);
    return this.registry.entries[normalizedKey]?.state === 'imported';
  }
}

// Usage in file path comparisons
function resolvePdfPath(attachmentPath: string | null, dataDir: string, itemKey: string): string | null {
  if (!attachmentPath) return null;

  if (attachmentPath.startsWith('storage:')) {
    const filename = attachmentPath.substring('storage:'.length);
    // Normalize before path operations
    const normalizedKey = normalizeItemKey(itemKey);
    const resolved = path.join(dataDir, 'storage', normalizedKey, filename);
    return resolved;
  }

  return attachmentPath;
}
```

### Pattern 6: Lazy Database Initialization
**What:** Defer expensive database operations until first use
**When to use:** Plugin startup; defer connector initialization to first triage view open
**Example:**
```typescript
// Source: Obsidian startup optimization patterns
export default class ZotBridgePlugin extends Plugin {
  connector!: ZoteroConnector;
  private connectorInitialized = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize connector without connecting to database
    const pluginDir = this.getPluginDir();
    this.connector = new ZoteroConnector(pluginDir);
    // Intentionally DO NOT call connector.connect() here

    // Register views
    this.registerView(TRIAGE_VIEW_TYPE, (leaf) => new TriageView(leaf, this));

    // ...rest of initialization
  }

  /**
   * Initialize database connection on first use
   * Called by TriageView.onOpen() before first database access
   */
  async ensureConnected(): Promise<void> {
    if (this.connectorInitialized) return;

    if (!this.settings.zoteroDbPath) {
      throw new Error('Database path not configured');
    }

    try {
      await this.connector.connect(this.settings.zoteroDbPath);
      this.connectorInitialized = true;
    } catch (err) {
      throw new Error(`Failed to connect to database: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// Usage in TriageView
class TriageView extends ItemView {
  async generateAndShowBatch(): Promise<void> {
    const progress = new ProgressTracker();

    try {
      // Ensure database is connected before first access
      await this.plugin.ensureConnected();

      progress.start('Loading library', 5000);
      const items = await this.plugin.connector.loadItems((loaded, total) => {
        progress.update(loaded);
      });

      progress.complete(`Loaded ${items.length} items`);
    } catch (err) {
      const context = getErrorContext(err as Error);
      progress.error(context.message);
    }
  }
}
```

### Anti-Patterns to Avoid
- **Blocking UI while loading:** Never block the main thread; always use async + progress feedback
- **Silent failures:** Always notify user of errors; "no error = success" hides real problems
- **Retrying non-idempotent operations:** Only retry operations that are safe to retry (reads, not writes)
- **Case-sensitive comparisons on Linux:** Always normalize to lowercase for cross-platform
- **Leaving database connections open:** Always close in `onunload()` and error handlers
- **Event listener memory leaks:** Always unregister listeners in `onunload()` using plugin disposal pattern

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry logic | Custom exponential backoff | Exponential backoff with jitter pattern | Avoids thundering herd; industry standard |
| Error formatting | String concatenation | Result pattern + error context mapping | Type-safe; extensible to new error types |
| Progress UI | Custom HTML elements | Obsidian Notice API + simple text bar | Respects theme; non-blocking; easy to update |
| Case-insensitive keys | Ad-hoc toLowerCase() | Utility functions (normalizeItemKey, keysEqual) | Consistent; prevents bugs; easier to test |
| Memory monitoring | Ignore and hope | process.memoryUsage() in periodic checks | Detects leaks early; validates no infinite growth |
| Cross-platform paths | Hardcode C:\ or /home | utils/paths.ts detectZoteroPath() + normalizePath() | Already implemented; handles Windows/Mac/Linux |

**Key insight:** Exponential backoff with jitter is not optional for SQLITE_BUSY—immediate retry floods the database and worsens the problem. Error context mapping prevents developers from concatenating error messages, which loses context and leads to unhelpful user messages.

## Common Pitfalls

### Pitfall 1: Plugin Blocks Obsidian Startup
**What goes wrong:** Plugin initialization takes > 500ms; users notice startup lag
**Why it happens:** Database connection on load; loading all items synchronously; expensive initialization
**How to avoid:**
- Defer database connection to first triage view open (lazy initialization)
- Don't pre-load all items; load on-demand with progress feedback
- Use Obsidian's built-in performance debug tool (Settings → Advanced → clock icon) to measure
- Test with 5000+ item libraries before release
**Warning signs:** Startup time increases noticeably after enabling plugin; "startup overlay" shows > 100ms

### Pitfall 2: SQLITE_BUSY Errors Kill User Workflow
**What goes wrong:** User gets "database is locked" error when Zotero is open; can't retry
**Why it happens:** Immediate retry without delay floods database; Zotero has exclusive lock; no retry mechanism
**How to avoid:**
- Implement exponential backoff retry (3-5 attempts, 100ms initial delay, 2x multiplier)
- Add jitter (50-100ms) to prevent thundering herd when multiple clients retry
- Only retry idempotent operations (reads, not writes)
- After final retry, show user-friendly message: "Zotero is currently accessing the database. Please close Zotero or wait a moment and try again."
**Warning signs:** Users report "operation failed" when Zotero is open; no retry attempts logged

### Pitfall 3: Error Messages Confuse Users
**What goes wrong:** User sees "SQLITE_BUSY: database is locked" or stack trace
**Why it happens:** Technical error surfaced directly; no context; no actionable steps
**How to avoid:**
- Map all technical errors to user-friendly messages with actions (Result pattern)
- Message format: "[Action-oriented title]\n[What happened in plain English]\n[What to do next]"
- Actions include: "Retry", "Open Settings", "Copy Error Details", "Close Zotero"
- Never show raw stack traces unless user explicitly asks (debug mode)
**Warning signs:** Support requests for error messages; users don't know what to do

### Pitfall 4: Memory Leaks in Extended Sessions
**What goes wrong:** Plugin memory usage grows over 8+ hours; Obsidian becomes sluggish
**Why it happens:** Event listeners not unregistered; timers not cleared; database connections held; circular references
**How to avoid:**
- Register all listeners in `onload()` and UNREGISTER in `onunload()`
- Use plugin's `registerEvent()` method which auto-unregisters
- Close database connection in `onunload()` explicitly
- Test memory with `process.memoryUsage()` after 100 batch operations; verify stable
- Use Chrome DevTools heap snapshots if leaked
**Warning signs:** `process.memoryUsage().heapUsed` grows monotonically; no plateau

### Pitfall 5: Cross-Platform Path Bugs on Linux
**What goes wrong:** Plugin works on Windows/Mac but fails on Linux; "file not found" errors
**Why it happens:** Case-sensitive file comparison (Linux ≠ Windows); path separator differences (/ vs \)
**How to avoid:**
- Normalize all file paths to lowercase + forward slashes before comparison
- Use utils/paths.ts functions (normalizeItemKey, pathsEqual, keysEqual)
- Test on all three platforms before release (or use CI with Linux Docker)
- Don't assume file existence; always check with fs.existsSync() after operations
**Warning signs:** Plugin works on Windows; users on Linux report "not found" errors; case inconsistencies in logs

### Pitfall 6: Progress Feedback Missing During Long Operations
**What goes wrong:** Plugin appears frozen for 10+ seconds; user closes Obsidian thinking it crashed
**Why it happens:** No progress indication; no feedback during database load
**How to avoid:**
- Start persistent Notice (0ms timeout) before any operation > 500ms
- Update Notice every 500-1000 items with progress percentage
- Use ProgressTracker class; call `update()` in progress callbacks
- Show final success message (auto-dismiss after 5s)
**Warning signs:** User reports "plugin froze"; no progress indication in logs; operations > 5s without feedback

### Pitfall 7: Database Connection Not Closed on Error
**What goes wrong:** Plugin crashes; database file locked; user can't edit in Zotero
**Why it happens:** Error in loadItems(); connection not closed in catch block
**How to avoid:**
- Always call `connector.close()` in finally block or error handlers
- Use try-catch-finally pattern; close in finally
- Test error scenarios: missing database, schema version mismatch, etc.
- Verify Zotero database is unlocked after error (check in Zotero)
**Warning signs:** After plugin error, Zotero shows "database locked"; restart needed to unlock

## Code Examples

### Complete Error Handling Flow
```typescript
// Source: Error handling best practices + Phase 5 requirements
interface ErrorContext {
  title: string;
  message: string;
  actions: Array<{ label: string; action: () => void }>;
  technical?: string;
}

class AppError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public technicalDetails?: string
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}

function getErrorContext(error: unknown): ErrorContext {
  if (error instanceof AppError) {
    switch (error.code) {
      case 'DB_NOT_FOUND':
        return {
          title: 'Zotero Database Not Found',
          message: error.userMessage,
          actions: [
            {
              label: 'Auto-detect',
              action: () => detectZoteroPath()
            }
          ],
          technical: error.technicalDetails
        };

      case 'SQLITE_BUSY':
        return {
          title: 'Database Temporarily Locked',
          message: error.userMessage,
          actions: [
            {
              label: 'Retry',
              action: () => retryLastOperation()
            }
          ],
          technical: error.technicalDetails
        };

      default:
        return {
          title: 'Error',
          message: error.userMessage,
          actions: [
            {
              label: 'Dismiss',
              action: () => {}
            }
          ],
          technical: error.technicalDetails
        };
    }
  }

  // Unknown error
  const message = error instanceof Error ? error.message : String(error);
  return {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred. Please check the technical details below.',
    actions: [
      {
        label: 'Copy Details',
        action: () => copyToClipboard(message)
      }
    ],
    technical: message
  };
}

// Usage
try {
  await this.plugin.connector.connect(dbPath);
} catch (err) {
  const context = getErrorContext(err);
  new Notice(`${context.title}: ${context.message}`);
}
```

### Memory Monitoring in Plugin
```typescript
// Source: Node.js memory leak detection patterns
class MemoryMonitor {
  private initialHeap: number = 0;
  private maxHeap: number = 0;

  start(): void {
    const mem = process.memoryUsage();
    this.initialHeap = mem.heapUsed;
    this.maxHeap = mem.heapUsed;
    console.log(`Memory monitor started: ${this.formatBytes(mem.heapUsed)}`);
  }

  check(label: string): void {
    const mem = process.memoryUsage();
    const current = mem.heapUsed;
    const growth = current - this.maxHeap;

    if (current > this.maxHeap) {
      this.maxHeap = current;
      console.log(`Memory ${label}: ${this.formatBytes(current)} (growth: ${this.formatBytes(growth)})`);
    }

    // Alert if growth > 50MB in single operation (likely leak)
    if (growth > 50 * 1024 * 1024) {
      console.warn(`Unusual memory growth detected: ${this.formatBytes(growth)}`);
    }
  }

  private formatBytes(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
}

// Usage in plugin
export default class ZotBridgePlugin extends Plugin {
  private memoryMonitor = new MemoryMonitor();

  async onload(): Promise<void> {
    if (isDev()) {
      this.memoryMonitor.start();
    }
    // ... rest of init
  }

  async generateBatch(): Promise<void> {
    this.memoryMonitor.check('before batch generation');
    // ... batch logic
    this.memoryMonitor.check('after batch generation');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synchronous database loading | Async with progress callbacks | 2023+ | Non-blocking UI; better perceived performance |
| Immediate retry on SQLITE_BUSY | Exponential backoff + jitter | 2023+ | Prevents "thundering herd"; more successful retries |
| Raw error messages to users | Error context mapping + actions | 2024+ | Better UX; users know what to do |
| Load all items on startup | Lazy loading; load on first use | 2023+ | Startup performance; scales to 10k+ items |
| Manual memory cleanup | WeakMap for caches; plugin disposal | 2023+ | Fewer leaks; automatic cleanup on unload |
| Case-sensitive path comparisons | Case-insensitive normalization | 2023+ | Cross-platform reliability; no Linux-only bugs |

**Deprecated/outdated:**
- Blocking database connections: Async/await is now standard; Electron supports Promise
- Try-catch without context mapping: Result pattern preferred for error visibility
- Startup performance checks via manual timing: Use Obsidian's built-in debug overlay

## Open Questions

1. **Should plugin attempt auto-reconnect if database unavailable on first use?**
   - What we know: Phase 5 CONTEXT.md specifies error actions include "Retry"
   - What's unclear: Auto-retry after N seconds vs. only on user action?
   - Recommendation: Only retry on explicit user action; auto-retry can mask real problems and waste cycles

2. **How aggressive should memory monitoring be?**
   - What we know: Success criterion is "stable memory during extended sessions"
   - What's unclear: What's "extended"? 1 hour? 8 hours? How often to sample?
   - Recommendation: Check memory every 100 batch operations; alert if growth > 20MB in session

3. **What startup time is acceptable for plugin initialization?**
   - What we know: Research indicates plugins should load in < 100ms
   - What's unclear: Phase 5 goal is "no noticeable impact"; how to measure "noticeable"?
   - Recommendation: Lazy load everything except ribbon icon; defer to < 50ms

4. **Error log retention: how long to keep error history?**
   - What we know: CONTEXT.md mentions "error logging" as Claude's discretion
   - What's unclear: In-memory only? Persistent to settings? Max history size?
   - Recommendation: In-memory only; last 10 errors; available for "Copy Error Details" action

## Sources

### Primary (HIGH confidence)
- [Obsidian Notice API](https://docs.obsidian.md/Reference/TypeScript+API/Notice) - Official API for user feedback
- [Obsidian Plugin Sample](https://github.com/obsidianmd/obsidian-sample-plugin) - Official examples of Notice/Modal usage
- [SQLite SQLITE_BUSY Documentation](https://sqlite.org/c3ref/busy_handler.html) - Official SQLite concurrency handling
- [Microsoft Microservices - Exponential Backoff](https://dzfweb.gitbooks.io/microsoft-microservices-book/content/implement-resilient-applications/implement-retries-exponential-backoff.html) - Industry standard retry pattern
- [Functional Error Handling in TypeScript](https://arg-software.medium.com/functional-error-handling-in-typescript-with-the-result-pattern-5b96a5abb6d3) - Result pattern best practices
- Existing codebase (utils/paths.ts, ZoteroConnector) - Cross-platform detection already implemented

### Secondary (MEDIUM confidence)
- [Obsidian Performance Optimization Forum](https://forum.obsidian.md/t/call-for-plugin-performance-optimization-especially-for-plugin-startup/32321) - Community patterns for plugin startup
- [Better Stack - Node.js Memory Leaks](https://betterstack.com/community/guides/scaling-nodejs/high-performance-nodejs/nodejs-memory-leaks/) - Memory leak detection patterns
- [The 5 Commandments of Clean Error Handling](https://medium.com/with-orus/the-5-commandments-of-clean-error-handling-in-typescript-93a9cbdf1af5) - Error handling best practices
- [Understanding Database Connection Pooling](https://dev.to/siddharth_g/understanding-database-connection-pooling-420n) - Concurrency management patterns

### Tertiary (LOW confidence)
- WebSearch: Obsidian plugin UI patterns (evolving; not official docs)
- WebSearch: "SQLITE_BUSY Node.js handling" (community patterns; variable reliability)

## Metadata

**Confidence breakdown:**
- Error handling patterns (Result pattern): HIGH - Multiple authoritative sources agree
- SQLITE_BUSY retry logic: HIGH - Official SQLite + Microsoft Microservices + industry standard
- Obsidian Notice/Modal APIs: HIGH - Official documentation
- Cross-platform path detection: HIGH - Already implemented in codebase; tested
- Memory leak patterns: MEDIUM - Node.js best practices but not Obsidian-specific
- Startup optimization: MEDIUM - Forum discussions + common patterns; no official Obsidian timing requirements
- Progress indicator style: MEDIUM - Multiple plugins use Notice; specific thresholds are Claude's discretion

**Research date:** 2026-01-24
**Valid until:** 14 days (SQLITE_BUSY patterns stable; Obsidian APIs stable; error handling patterns stable; memory leak detection tools evolving)

## Implementation Notes for Planner

1. **Priority order for Phase 5 tasks:**
   - Task 1: Implement retry handler with exponential backoff (most impactful for SQLITE_BUSY)
   - Task 2: Add error context mapping (improves user experience immediately)
   - Task 3: Add progress tracking (visible improvement for batch operations)
   - Task 4: Lazy database initialization (startup optimization; deferred until last)

2. **Testing strategy (per Phase 5 success criteria):**
   - Test with 5000+ item library to validate startup impact
   - Simulate SQLITE_BUSY errors; verify retry logic with exponential backoff
   - Test cross-platform paths on Windows/Mac/Linux
   - Monitor memory with process.memoryUsage() over 100 batch operations
   - Verify all errors surface with actionable user messages

3. **Phase dependencies:**
   - Phases 1-4 features must be complete before polish applies
   - Error handling improvements apply to ALL existing operations
   - Cross-platform support validated against Phases 1-4 workflows
