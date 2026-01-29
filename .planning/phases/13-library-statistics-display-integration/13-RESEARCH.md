# Phase 13: Library Statistics Display Integration - Research

**Researched:** 2026-01-29
**Domain:** SQLite query execution in sql.js for statistics display
**Confidence:** HIGH

## Summary

Phase 13 needs to add a `query()` method to ZoteroConnector that executes arbitrary SQL queries and returns results. This bridges a gap where `settings.ts` line 360 calls `connector.query(LIBRARY_STATS_QUERY)` but the method doesn't exist. The audit recommends Option B: adding a specific method for library stats to maintain encapsulation.

After investigation of the codebase:
- The pattern for executing queries is well-established via sql.js's `db.exec()` method
- Similar query execution patterns exist in DuplicateDetectionService and PreflightService
- The connector already has the sql.js Database instance and knows how to parse results
- The primary technical decision is whether to add a generic `query()` method or a specific `queryLibraryStats()` method

**Primary recommendation:** Implement specific `queryLibraryStats()` method in ZoteroConnector (Option B from audit) to maintain encapsulation, following the pattern used successfully by DuplicateDetectionService and PreflightService.

## Standard Stack

### Core Technologies
| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| sql.js | (bundled in plugin) | WebAssembly SQLite library for reading zotero.sqlite | Already in use |
| TypeScript | (project version) | Type-safe implementation | Already in use |
| Obsidian API | (project version) | Plugin framework | Already in use |

### Query Execution Pattern
The codebase uses sql.js's `Database.exec()` method which is standard across the project:
- `db.exec(sqlString)` - executes query, returns `QueryExecResult[]`
- `db.exec(sqlString, params)` - executes with parameterized values
- Returns: `Array<{columns: string[], values: any[][]}>` when result has rows, empty array when no rows

## Architecture Patterns

### Current Query Execution in ZoteroConnector

**Pattern 1: Direct db.exec() within methods**
```typescript
// Source: src/db/zotero-connector.ts (lines 207-215)
const result = this.db.exec(VERSION_QUERY);

if (result.length === 0 || result[0].values.length === 0) {
  return {
    supported: false,
    version: 0,
    message: 'Could not determine Zotero schema version...'
  };
}

const version = parseInt(String(result[0].values[0][0]), 10);
```

**Pattern 2: Service accessing private db via type assertion**
```typescript
// Source: src/services/duplicate-detection-service.ts (lines 57-64)
// This pattern is used because services don't own the database
const db = (this.connector as any).db;
if (!db) {
  throw new Error('Database not initialized');
}

const results = db.exec(DUPLICATES_QUERY);
```

**Pattern 3: Result parsing with column index lookup**
```typescript
// Source: src/services/duplicate-detection-service.ts (lines 76-83)
const columns = result.columns;
const duplicates: DuplicateGroup[] = result.values.map((row: any[]) => ({
  itemID: row[columns.indexOf('itemID')] as number,
  itemKey: row[columns.indexOf('itemKey')] as string,
  itemType: row[columns.indexOf('itemType')] as string,
  title: row[columns.indexOf('title')] as string | null,
  duplicateCount: row[columns.indexOf('duplicate_count')] as number
}));
```

### Recommended Approach for Phase 13

**Option B: Specific `queryLibraryStats()` method** (RECOMMENDED by audit)

Add a public method to ZoteroConnector that encapsulates the LIBRARY_STATS_QUERY execution:

```typescript
// In src/db/zotero-connector.ts, add this method to the ZoteroConnector class

/**
 * Query library statistics for scope transparency.
 *
 * Returns counts for each library type and trash status:
 * - personalCount: Items in personal library (type='user'), not in trash
 * - groupCount: Items in group libraries (type='group'), not in trash
 * - feedCount: Items in feeds (type='feed'), not in trash
 * - trashCount: Items in trash (deletedItems), from all libraries
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
```

Then in `settings.ts` line 360, change from:
```typescript
const stats = await this.plugin.connector.query(LIBRARY_STATS_QUERY);
```

To:
```typescript
const stats = await this.plugin.connector.queryLibraryStats();
```

And simplify line 361:
```typescript
const row = stats; // stats is already the object we need
```

### Alternative Option A: Generic query() Method

This would add a generic public query method to ZoteroConnector accepting any SQL string:

```typescript
async query(sql: string): Promise<any[][]> {
  if (!this.db) {
    throw new Error('Database not connected');
  }
  const results = this.db.exec(sql);
  return results.length > 0 ? results[0].values : [];
}
```

**Tradeoff:** This exposes the entire database to any caller. Less encapsulation, potential for misuse, but more flexible. The audit recommends against this.

## Don't Hand-Roll

| Problem | Why Not Custom | Use Instead | Why |
|---------|----------------|-----------|----|
| SQL query execution in sql.js | Would require reimplementing db.exec() parser | sql.js built-in `Database.exec()` | Already integrated, handles all edge cases |
| Result parsing/type conversion | Manual column index tracking is error-prone | Existing pattern: `columns.indexOf()` with mapping | Already proven in DuplicateDetectionService |
| Statistics aggregation | Could calculate in TypeScript after loading all items | SQL aggregation via LIBRARY_STATS_QUERY | Faster (single pass), smaller memory footprint |

**Key insight:** sql.js's `exec()` method is the only way to run queries in this architecture (sql.js is WebAssembly, not Node.js native SQLite). There's no alternative - this is the standard approach.

## Common Pitfalls

### Pitfall 1: Assuming Database is Always Connected
**What goes wrong:** Query fails with "Database not connected" when method is called before connection established
**Why it happens:** Settings panel renders before database is loaded (lazy initialization per Phase 12 decision)
**How to avoid:** Always check `if (!this.db)` and throw clear error message
**Warning signs:**
- Error logs show "Database not connected"
- Settings panel shows "unavailable" for library stats
- Try/catch in `renderLibraryScopeSection()` catches the error (which is correct per Phase 12)

### Pitfall 2: Incorrect Result Parsing from sql.js
**What goes wrong:** Getting `undefined` for statistics values, null pointer exceptions, or wrong counts
**Why it happens:** sql.js returns `QueryExecResult[]` which is an array of result sets. First query returns first element `results[0]`, not direct object
**How to avoid:** Always check `results.length > 0` and `results[0].values.length > 0` before accessing
**Warning signs:**
- Test shows personalCount as `undefined` instead of a number
- Row access fails with "Cannot read property of undefined"

**Example mistake:**
```typescript
// WRONG - assumes results is direct row array
const stats = results[0];

// CORRECT - unpack the result structure
const [result] = results;
const row = result.values[0];
```

### Pitfall 3: Not Handling Parameterized Queries
**What goes wrong:** Values might have SQL injection vulnerabilities or special characters cause parsing errors
**Why it happens:** LIBRARY_STATS_QUERY doesn't use parameters (it's read-only aggregation), but future stats queries might
**How to avoid:** Keep this method simple for LIBRARY_STATS_QUERY specifically. If future queries need parameterization, create separate typed methods
**Warning signs:**
- If ever adding LIBRARY_STATS_QUERY parameters, make sure to use sql.js's parameter feature (already demonstrated in CREATORS_QUERY usage)

### Pitfall 4: Missing Statistics During First Plugin Load
**What goes wrong:** Settings panel renders before database connected, shows "unavailable" instead of actual counts
**Why it happens:** Phase 12 implements async lazy loading. renderLibraryScopeSection() is async but called in sync display() method using `void`
**How to avoid:** This is already correctly handled by:
  1. `renderLibraryScopeSection()` is marked `async`
  2. Called with `void this.renderLibraryScopeSection(containerEl)` to prevent blocking
  3. Try/catch in the method gracefully shows "unavailable" if database not connected
**Warning signs:** This is expected behavior per Phase 12 - not a pitfall if handled correctly

## Code Examples

### Query Execution Pattern (Proven in codebase)
```typescript
// Source: DuplicateDetectionService and PreflightService pattern
const results = db.exec(LIBRARY_STATS_QUERY);

if (!results || results.length === 0) {
  return { personalCount: 0, groupCount: 0, feedCount: 0, trashCount: 0 };
}

const [result] = results;
if (!result.values || result.values.length === 0) {
  return { personalCount: 0, groupCount: 0, feedCount: 0, trashCount: 0 };
}

const columns = result.columns;
const row = result.values[0];

return {
  personalCount: (row[columns.indexOf('personalCount')] as number) || 0,
  groupCount: (row[columns.indexOf('groupCount')] as number) || 0,
  feedCount: (row[columns.indexOf('feedCount')] as number) || 0,
  trashCount: (row[columns.indexOf('trashCount')] as number) || 0
};
```

### Error Handling Pattern (From renderLibraryScopeSection)
```typescript
// Source: src/settings.ts lines 358-393
try {
  const stats = await this.plugin.connector.queryLibraryStats();

  // Display statistics...
} catch (err) {
  // Graceful degradation if query fails
  containerEl.createEl('p', {
    cls: 'setting-item-description',
    text: 'Library statistics unavailable (database not connected)'
  });
}
```

## State of the Art

| Aspect | Current Approach | Notes |
|--------|------------------|-------|
| Query execution | sql.js `Database.exec()` | WebAssembly-based, only option for Obsidian |
| Result parsing | Column index lookup with `columns.indexOf()` | Proven in DuplicateDetectionService and PreflightService |
| Error handling | Graceful degradation with try/catch | Settings loads even if database offline (Phase 12) |
| Method visibility | Public methods on ZoteroConnector | DuplicateDetectionService shows pattern when services need access |

**Deprecated/outdated:**
- Generic `query()` method: audit recommends against this (Option C: Remove statistics, Option A: Generic method) - use specific method instead (Option B)

## Open Questions

1. **Should LIBRARY_STATS_QUERY be cached?**
   - What we know: Query executes once per settings panel render
   - What's unclear: Whether statistics change frequently enough to warrant caching
   - Recommendation: No caching needed for Phase 13. If performance becomes issue, add caching later with invalidation on library changes

2. **What if library stats take too long on large databases?**
   - What we know: LIBRARY_STATS_QUERY runs a single full table scan with basic aggregation
   - What's unclear: Performance on 10k+ items
   - Recommendation: Execute async (already done per Phase 12). Monitor performance during testing. Query is optimized (single pass with INNER JOINs only on required tables)

3. **Should ZoteroConnector expose other types of queries in future?**
   - What we know: Option B recommends specific methods for encapsulation
   - What's unclear: Whether future phases will need other ad-hoc queries
   - Recommendation: Wait for future needs. Add specific typed methods like `queryLibraryStats()` rather than generic `query()` method

## Sources

### Primary (HIGH confidence)
- `src/db/zotero-connector.ts` - Connector implementation with pattern for db.exec() usage (lines 207-256, 366-544)
- `src/services/duplicate-detection-service.ts` - Service pattern for accessing db and executing queries (lines 47-96)
- `src/services/preflight-service.ts` - Alternative service showing same query execution pattern (lines 118-148)
- `src/db/queries.ts` - LIBRARY_STATS_QUERY definition and documentation (lines 328-356)
- `src/settings.ts` - Current call to non-existent query() method (line 360)

### Secondary (MEDIUM confidence)
- sql.js source code patterns: Well-established WebAssembly SQLite library used in Obsidian plugins
- Project's Phase 12 decisions: Async statistics with graceful degradation pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - sql.js is documented and the only option for Obsidian's architecture
- Architecture: HIGH - Query execution pattern proven across DuplicateDetectionService and PreflightService
- Pitfalls: HIGH - Common patterns documented in codebase, no surprising edge cases beyond what's already handled
- Implementation approach: HIGH - Audit recommendation and codebase patterns align on Option B

**Research date:** 2026-01-29
**Valid until:** 2026-02-05 (sql.js stable, no expected changes)

## Decision Summary

**Recommendation:** Implement Phase 13 using Option B from the audit.

**Implementation approach:**
1. Add `async queryLibraryStats()` public method to ZoteroConnector
2. Method returns typed object: `{ personalCount, groupCount, feedCount, trashCount }`
3. Handles error case: throws if database not connected (already caught by settings.ts try/catch)
4. Update settings.ts to call new method instead of non-existent `query()`
5. Query already exists in `queries.ts` as LIBRARY_STATS_QUERY

**Why this approach:**
- Maintains encapsulation: Connector controls which queries can be executed
- Consistent with codebase: DuplicateDetectionService and PreflightService follow same pattern
- Type-safe: Specific return type prevents parsing errors
- Error handling: Clear failure modes that settings.ts already expects
- Future-proof: Easy to add other specific query methods later if needed
