# Phase 9: Library Filtering Foundation - Research

**Researched:** 2026-01-27
**Domain:** SQLite library-level filtering, Zotero schema for library types and deletion
**Confidence:** HIGH

## Summary

Phase 9 implements query-level filtering to restrict plugin operations to personal library items only. Research confirms that Zotero's SQLite schema provides clear mechanisms to distinguish personal, group, and feed libraries, as well as deleted and retracted items. The plugin currently loads ALL library items via `ITEMS_QUERY`; this phase adds WHERE clause filtering to exclude non-personal items before data processing.

Key findings:

1. **Personal library identification**: In the Zotero schema, items have a `libraryID` foreign key to the `libraries` table. Library type is stored in `libraries.type` (values: 'user' for personal, 'group' for group libraries, 'feed' for feeds). Personal libraries can be filtered via `libraries.type = 'user'`.

2. **Deleted and retracted items**: The schema includes `deletedItems` table (items in trash) and `retractedItems` table (Zotero 7.0+). Current `ITEMS_QUERY` already excludes deletedItems; need to add retractedItems exclusion.

3. **Query structure**: All filtering should occur at SQL query time (WHERE/JOIN), not post-processing. This reduces memory overhead and simplifies downstream code (no need for client-side filtering).

4. **No breaking changes**: Filtering affects new onboardings only; existing user profiles remain untouched per CONTEXT.md decisions.

**Primary recommendation:** Extend ITEMS_QUERY with INNER JOIN to libraries table and optional LEFT JOIN to retractedItems table. Add query builder helper to centralize scope filtering logic, making it reusable across all database queries (onboarding, batch generation, registry lookups).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sql.js | 1.13.0+ | SQLite WASM engine | Already in Phase 1; handles parametric queries and JOIN operations |
| ZoteroConnector | (codebase) | Database connection layer | Existing pattern for query execution; extend with library filtering |
| queries.ts | (codebase) | SQL query definitions | Central location for all database queries; add new ITEMS_QUERY_FILTERED variant |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sqlite_master | (SQL built-in) | Schema introspection | Validate retractedItems table exists (Zotero 7+) before attempting join |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQL-level WHERE clause filtering | Client-side array filtering after query | SQL filtering is more efficient; post-query filtering burdens JavaScript runtime |
| INNER JOIN for library filter | LEFT JOIN with WHERE check | INNER JOIN is cleaner; LEFT JOIN adds NULL handling overhead |
| Conditional retractedItems join | Always join retractedItems | Conditional join (with schema check) provides graceful degradation for Zotero 6.x |
| Single query variant | Multiple ITEMS_QUERY variants (filtered/unfiltered) | Single variant keeps codebase simpler; filtering always applied per CONTEXT.md |

**Installation:**
```bash
# No new packages required
# Existing sql.js + ZoteroConnector pattern only
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── queries.ts                      # (update with ITEMS_QUERY filtering)
│   ├── zotero-connector.ts             # (extend with library filter helpers)
│   └── library-scope.ts (NEW)           # (centralize library filter logic)
├── types.ts                            # (optional: add libraryID field to ZoteroItem)
└── ui/
    └── seed-paper-picker.ts            # (uses filtered items from updated loadItems)
```

### Pattern 1: Library-Scoped Query Helper
**What:** Centralize WHERE clause fragments for library filtering, making them reusable across all queries
**When to use:** Any database query that needs to filter by personal library (ITEMS_QUERY, item counts, search results)
**Example:**
```typescript
// Source: Zotero schema + CONTEXT.md decisions
// File: src/db/library-scope.ts (NEW)

/**
 * Build library scope filter for WHERE clause
 * Restricts queries to personal library (type='user') only
 *
 * @returns SQL fragment: "i.libraryID IN (SELECT libraryID FROM libraries WHERE type = 'user')"
 */
export function getPersonalLibraryFilter(): string {
  return `i.libraryID IN (SELECT libraryID FROM libraries WHERE type = 'user')`;
}

/**
 * Build retracted items exclusion filter
 * Gracefully handles Zotero 6.x (no retractedItems table) vs Zotero 7.0+
 * Checks schema first to avoid query errors
 *
 * @returns SQL fragment: "AND i.itemID NOT IN (SELECT itemID FROM retractedItems)"
 *          or empty string if retractedItems table doesn't exist
 */
export async function getRetractedItemsFilter(db: Database): Promise<string> {
  // Check if retractedItems table exists (Zotero 7.0+)
  const tableCheck = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='retractedItems'"
  );

  if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
    // Table doesn't exist (Zotero 6.x) - no filter needed
    return '';
  }

  return `AND i.itemID NOT IN (SELECT itemID FROM retractedItems)`;
}
```

### Pattern 2: Updated ITEMS_QUERY with Library Filtering
**What:** Modify main items query to apply personal library filter at SQL level
**When to use:** Loading all items for onboarding or batch operations
**Example:**
```typescript
// Source: src/db/queries.ts (UPDATED)

/**
 * Main items query using CTE to pivot EAV into columns.
 *
 * NOW INCLUDES:
 * - INNER JOIN to libraries table (restricts to personal library type='user')
 * - LEFT JOIN to retractedItems table (excludes retracted items for Zotero 7+)
 * - Existing exclusions: deletedItems, attachments, notes, annotations
 *
 * Returns: itemID, itemKey, dateAdded, dateModified, itemType,
 *          title, doi, date, journal, volume, issue, pages, abstract, publisher, isbn
 */
export const ITEMS_QUERY = `
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
  INNER JOIN libraries l ON i.libraryID = l.libraryID
  JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
  LEFT JOIN itemData id ON i.itemID = id.itemID
  LEFT JOIN fields f ON id.fieldID = f.fieldID
  LEFT JOIN itemDataValues idv ON id.valueID = idv.valueID
  LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
  WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
    AND it.typeName != 'attachment'
    AND it.typeName != 'note'
    AND it.typeName != 'annotation'
    AND l.type = 'user'
    AND ri.itemID IS NULL
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
  MAX(CASE WHEN fieldName = 'issue' THEN value END) AS issue,
  MAX(CASE WHEN fieldName = 'pages' THEN value END) AS pages,
  MAX(CASE WHEN fieldName = 'abstractNote' THEN value END) AS abstract,
  MAX(CASE WHEN fieldName = 'publisher' THEN value END) AS publisher,
  MAX(CASE WHEN fieldName = 'ISBN' THEN value END) AS isbn
FROM itemFields
GROUP BY itemID
ORDER BY dateAdded DESC
`;
```

### Pattern 3: Schema Validation (Defensive Initialization)
**What:** Verify schema prerequisites before running filtered queries
**When to use:** On plugin startup, before first item load
**Example:**
```typescript
// Source: ZoteroConnector initialization (extend existing pattern)

/**
 * Validate that schema supports library filtering
 * Checks for:
 * - libraries table (required)
 * - retractedItems table (optional, Zotero 7.0+)
 */
async validateLibraryFilterSchema(): Promise<{ valid: boolean; hasRetractedItems: boolean }> {
  if (!this.db) {
    return { valid: false, hasRetractedItems: false };
  }

  try {
    // Check libraries table
    const librariesCheck = this.db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='libraries'"
    );

    if (librariesCheck.length === 0 || librariesCheck[0].values.length === 0) {
      console.error('libraries table not found - schema may be corrupted');
      return { valid: false, hasRetractedItems: false };
    }

    // Check retractedItems table (optional)
    const retractedCheck = this.db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='retractedItems'"
    );

    const hasRetractedItems = retractedCheck.length > 0 && retractedCheck[0].values.length > 0;

    return { valid: true, hasRetractedItems };
  } catch (err) {
    console.error('Schema validation failed:', err);
    return { valid: false, hasRetractedItems: false };
  }
}
```

### Anti-Patterns to Avoid
- **No post-query filtering**: Don't load all items then filter in JavaScript. This wastes memory and CPU; filter at SQL level.
- **Hardcoded library IDs**: Don't hardcode `libraryID = 1` assuming personal library is always ID 1. Use `libraries.type = 'user'` to be schema-agnostic.
- **Silent retractedItems failures**: Don't skip retractedItems filter if table doesn't exist (Zotero 6.x). Instead, check schema first and gracefully degrade.
- **No query builder abstraction**: Don't duplicate library filter WHERE clauses across multiple queries. Centralize in helper functions.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting personal vs group library | String comparison or hardcoded IDs | `libraries.type = 'user'` JOIN | Type column is standard across all Zotero versions; hardcoded IDs are fragile |
| Excluding retracted items | Maintain separate retracted list in memory | LEFT JOIN to retractedItems with NULL check | SQL-level filtering is more efficient; schema provides the table for this use case |
| Checking if retractedItems exists | Try/catch on query fail | Query sqlite_master before using table | Explicit schema check is more robust than exception handling |
| Building WHERE clauses | String concatenation in multiple places | Centralized query builder helper functions | Reduces duplication and makes scope changes maintainable |

**Key insight:** Library filtering looks simple (just add a WHERE clause) but becomes complex when multiplied across onboarding, batch generation, registry lookups, and item counts. Centralizing the filter logic in helper functions prevents scope creep and ensures consistency.

## Common Pitfalls

### Pitfall 1: Forgetting to Filter Item Counts
**What goes wrong:** You filter ITEMS_QUERY but forget to filter ITEM_COUNT_QUERY. UI shows "234 personal items" but seed picker only loads 189 items (because count query returned all items).
**Why it happens:** Developers update the main query first, then forget count queries are separate.
**How to avoid:** Create a reusable WHERE clause fragment for library filtering (see Pattern 1). Apply to BOTH ITEMS_QUERY and ITEM_COUNT_QUERY.
**Warning signs:** Count displayed in UI doesn't match items actually loaded; progress indicator shows wrong total.

### Pitfall 2: Query Failure on Zotero 6.x (No retractedItems Table)
**What goes wrong:** Plugin crashes or hangs when loading items from Zotero 6.x because query tries to LEFT JOIN retractedItems table that doesn't exist.
**Why it happens:** Assumption that all Zotero users are on 7.0+; retractedItems feature was added in 7.0.
**How to avoid:** Check sqlite_master before using retractedItems table (see Pattern 3). Gracefully degrade: skip join if table doesn't exist.
**Warning signs:** Plugin works on some machines (Zotero 7.0+) but crashes on others (Zotero 6.x).

### Pitfall 3: Loading Items Before Schema Validation
**What goes wrong:** Plugin tries to load items with library filter, but schema validation hasn't run yet. If validation fails silently, downstream code assumes items are filtered but they're not.
**Why it happens:** Validation is expensive (extra queries), so developers skip it on first load.
**How to avoid:** Run schema validation once on first connection (in `connect()` method or setup wizard). Cache the result. Fail loudly if libraries table is missing.
**Warning signs:** Items from group libraries appear in onboarding seed picker; no error message explains why.

### Pitfall 4: libraryID Mismatch in Multi-Library Queries
**What goes wrong:** When querying related items (e.g., finding items by author), you accidentally mix items from personal and group libraries because you forgot to filter the join.
**Why it happens:** When joining multiple tables, it's easy to forget filter conditions on joined tables.
**How to avoid:** Always explicitly join to libraries table first. Make library filtering the first WHERE condition.
**Warning signs:** Batch generation produces items from group libraries; recommendations reference group items.

### Pitfall 5: Not Handling NULL in retractedItems Check
**What goes wrong:** Query includes `ri.itemID IS NULL` check, but on Zotero 6.x (no LEFT JOIN to retractedItems), this condition always passes incorrectly.
**Why it happens:** Conditional NULL checks without schema validation context.
**How to avoid:** Don't conditionally include `IS NULL` in query string. Instead, build entire JOIN+filter block only if table exists (see Pattern 3).
**Warning signs:** Items behave differently on Zotero 6.x vs 7.0+ despite no code changes.

## Code Examples

Verified patterns from official sources:

### Query: Personal Library Items with Filtering
```typescript
// Source: Zotero schema (github.com/zotero/zotero/blob/main/resource/schema/userdata.sql)
// + CONTEXT.md decisions

const ITEMS_QUERY_FILTERED = `
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
  INNER JOIN libraries l ON i.libraryID = l.libraryID
  JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
  LEFT JOIN itemData id ON i.itemID = id.itemID
  LEFT JOIN fields f ON id.fieldID = f.fieldID
  LEFT JOIN itemDataValues idv ON id.valueID = idv.valueID
  LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
  WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
    AND it.typeName NOT IN ('attachment', 'note', 'annotation')
    AND l.type = 'user'
    AND ri.itemID IS NULL
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
  MAX(CASE WHEN fieldName = 'issue' THEN value END) AS issue,
  MAX(CASE WHEN fieldName = 'pages' THEN value END) AS pages,
  MAX(CASE WHEN fieldName = 'abstractNote' THEN value END) AS abstract,
  MAX(CASE WHEN fieldName = 'publisher' THEN value END) AS publisher,
  MAX(CASE WHEN fieldName = 'ISBN' THEN value END) AS isbn
FROM itemFields
GROUP BY itemID
ORDER BY dateAdded DESC
`;
```

### Query: Count Personal Library Items
```typescript
// Source: CONTEXT.md + pattern consistency

const ITEM_COUNT_QUERY_FILTERED = `
SELECT COUNT(*) as count
FROM items i
INNER JOIN libraries l ON i.libraryID = l.libraryID
JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
  AND it.typeName NOT IN ('attachment', 'note', 'annotation')
  AND l.type = 'user'
  AND ri.itemID IS NULL
`;
```

### Helper: Library Filter Builder
```typescript
// Source: Pattern 1 (library-scope.ts)

/**
 * Build complete library filter for WHERE clause
 * Returns the base filter that applies to all library-scoped queries
 */
export function buildPersonalLibraryFilter(): {
  join: string;
  where: string;
} {
  return {
    join: `INNER JOIN libraries l ON i.libraryID = l.libraryID`,
    where: `l.type = 'user'`
  };
}
```

### Helper: Retracted Items Filter (Conditional)
```typescript
// Source: Pattern 3 (defensive initialization)

/**
 * Check if retractedItems table exists and return appropriate filter
 * This allows graceful degradation for Zotero 6.x
 */
export async function getRetractedItemsFilter(db: Database): Promise<string> {
  const tableExists = await schemaTableExists(db, 'retractedItems');

  if (!tableExists) {
    return ''; // Zotero 6.x - no retractedItems table
  }

  return `LEFT JOIN retractedItems ri ON i.itemID = ri.itemID`;
}

export async function getRetractedItemsWhere(db: Database): Promise<string> {
  const tableExists = await schemaTableExists(db, 'retractedItems');

  if (!tableExists) {
    return ''; // Zotero 6.x - no where condition needed
  }

  return `AND ri.itemID IS NULL`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Load all items, filter in JS | Filter at SQL level (WHERE/JOIN) | Phase 9 | More efficient; reduces memory usage; simplifies downstream code |
| Hardcoded libraryID = 1 | Query libraries.type = 'user' | Phase 9 | Schema-agnostic; works across Zotero versions |
| Ignore retracted items | LEFT JOIN retractedItems with NULL check | Phase 9 (Zotero 7.0+) | Explicitly excludes flagged items; gracefully degrades for Zotero 6.x |
| Count all items | Count filtered items only | Phase 9 | UI accurately reflects what's available |

**Deprecated/outdated:**
- None for this phase; library filtering is a new feature

## Open Questions

Things that couldn't be fully resolved:

1. **Library type column values (LOW confidence)**
   - What we know: Zotero schema includes `libraries.type` column; search results and GitHub schema indicate values like 'user', 'group', 'feed'
   - What's unclear: Are these the only type values? Are there edge cases (e.g., 'archived', 'deleted' types)?
   - Recommendation: Verify exact type values against actual Zotero database before writing task. Check by running `SELECT DISTINCT type FROM libraries` on a real Zotero installation with group libraries and feeds.

2. **Retracted items table schema (MEDIUM confidence)**
   - What we know: Zotero 7.0+ has `retractedItems` table with itemID and data fields
   - What's unclear: Does this table get cleaned up during sync? Are there edge cases where items are marked retracted but not deleted?
   - Recommendation: Test retracted items flow against real Zotero 7.0+ database. Verify that LEFT JOIN with NULL check correctly excludes all retracted items.

3. **Empty personal library error handling (LOW confidence)**
   - What we know: CONTEXT.md specifies showing error modal if user has no personal library items
   - What's unclear: What exact conditions trigger "no personal library items"? Is it `COUNT = 0` or something more nuanced (e.g., user deleted all items)?
   - Recommendation: Implement simple `COUNT > 0` check. Plan to gather user feedback if edge cases emerge in beta.

4. **Feeds and feedItems relationship (LOW confidence)**
   - What we know: Zotero schema includes `feeds` table with libraryID foreign key; feeds are a library type
   - What's unclear: Do feed items appear in the items table with a feed libraryID? Or are they separate (feedItems table)?
   - Recommendation: Verify by querying actual feed libraries. Ensure ITEMS_QUERY correctly excludes feed items when filtering for `type = 'user'`.

## Sources

### Primary (HIGH confidence)
- [Zotero userdata.sql schema](https://github.com/zotero/zotero/blob/main/resource/schema/userdata.sql) - items, libraries, deletedItems, retractedItems table definitions
- [caiorss/zhserver schema file](https://github.com/caiorss/zhserver/blob/master/database/zotero-sqlite-schema.sql) - feeds table definition, library schema overview
- CONTEXT.md (Phase 9) - implementation decisions, hard-coded exclusions, no user configuration
- Existing codebase (src/db/queries.ts, zotero-connector.ts) - current query patterns, integration points

### Secondary (MEDIUM confidence)
- [Zotero Forums: SQL query to retrieve items in group libraries](https://forums.zotero.org/discussion/35946/) - confirms libraryID filtering pattern
- [Official Zotero developer documentation](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access) - general SQLite access patterns (verified with WebFetch)

### Tertiary (LOW confidence)
- WebSearch results on library filtering patterns (multiple sources suggest `type = 'user'` approach but not from official docs)

## Metadata

**Confidence breakdown:**
- Schema structure (items, libraries, retractedItems, deletedItems): **HIGH** - Verified against official GitHub schema
- Filtering approach (INNER JOIN + LEFT JOIN pattern): **HIGH** - Standard SQL pattern; matches schema structure
- Zotero 6.x vs 7.0+ compatibility: **HIGH** - schema check pattern is defensive best practice
- Library type values ('user', 'group', 'feed'): **MEDIUM** - inferred from search results + schema; not explicitly verified against docs
- Empty library error handling: **MEDIUM** - CONTEXT.md decision is clear; implementation details need testing
- Feeds table integration: **LOW** - Schema exists but relationship to items unclear; needs real-world verification

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (30 days for stable schema; feeds integration may need re-verification if unclear in planning)
