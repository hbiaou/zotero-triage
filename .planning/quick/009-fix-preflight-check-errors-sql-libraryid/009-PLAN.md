---
phase: quick-009
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/db/queries.ts
autonomous: true

must_haves:
  truths:
    - "Trash check runs without SQL errors"
    - "Duplicate count accurately reflects actual duplicates"
  artifacts:
    - path: "src/db/queries.ts"
      provides: "Fixed TRASH_COUNT_QUERY and DUPLICATES_QUERY"
      exports: ["TRASH_COUNT_QUERY", "DUPLICATES_QUERY"]
  key_links:
    - from: "src/services/preflight-service.ts"
      to: "TRASH_COUNT_QUERY"
      via: "db.exec(TRASH_COUNT_QUERY)"
      pattern: "db\\.exec\\(TRASH_COUNT_QUERY\\)"
    - from: "src/services/duplicate-detection-service.ts"
      to: "DUPLICATES_QUERY"
      via: "db.exec(DUPLICATES_QUERY)"
      pattern: "db\\.exec\\(DUPLICATES_QUERY\\)"
---

<objective>
Fix two SQL errors in preflight check queries that prevent accurate library health reporting.

Purpose: Ensure preflight check runs successfully and provides accurate duplicate counts
Output: Working trash check and duplicate detection without SQL errors
</objective>

<execution_context>
@C:\Users\Biaou\.claude\get-shit-done\workflows\execute-plan.md
@C:\Users\Biaou\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@.planning\PROJECT.md
@.planning\STATE.md
@src\db\queries.ts
@src\services\preflight-service.ts
@src\services\duplicate-detection-service.ts

## Problem Analysis

**Issue 1: TRASH_COUNT_QUERY SQL error "no such column: libraryID"**

Current query (lines 309-313):
```sql
SELECT COUNT(*) as count
FROM deletedItems
WHERE libraryID = (SELECT libraryID FROM libraries WHERE type = 'user' LIMIT 1)
```

The `deletedItems` table in Zotero's schema does NOT have a `libraryID` column directly. It only has `itemID`. To get the library, we must JOIN to the `items` table.

Correct pattern (used in LIBRARY_STATS_QUERY, line 352):
```sql
LEFT JOIN deletedItems di ON i.itemID = di.itemID
```

**Issue 2: DUPLICATES_QUERY returns incorrect count (13,399 when user has 0)**

Current query uses `COUNT(*) OVER (PARTITION BY match_basis)` which counts ALL items in each duplicate group for EVERY row. This creates a multiplication effect.

For example, if 3 items match on DOI:
- Item A gets duplicate_count = 3
- Item B gets duplicate_count = 3
- Item C gets duplicate_count = 3
- Total returned: 3 items

But the query's self-join logic `i1.itemID < i2.itemID` creates pairs:
- (A, B), (A, C), (B, C) = 3 pairs
- Each pair generates TWO rows (one for i1, one for i2)
- Result: 6 rows instead of 3

The service then counts `duplicates.length` which double-counts items.

## Architecture Context

Phase 11 established:
- Sequential preflight checks (trash → duplicates → groups)
- Zotero 6/7 compatibility via sqlite_master table check
- Graceful degradation on errors

Phase 10 established:
- DOI-first hierarchy for duplicate matching
- SQL-based title normalization
- Library filtering via INNER JOIN pattern

Phase 9 established:
- Consistent library filtering (personal library only, type='user')
- LEFT/INNER JOIN patterns for Zotero compatibility
</context>

<tasks>

<task type="auto">
  <name>Fix TRASH_COUNT_QUERY to use JOIN instead of direct libraryID access</name>
  <files>src/db/queries.ts</files>
  <action>
Update TRASH_COUNT_QUERY (lines 309-313) to JOIN items table for library filtering:

```sql
SELECT COUNT(*) as count
FROM deletedItems di
INNER JOIN items i ON di.itemID = i.itemID
INNER JOIN libraries l ON i.libraryID = l.libraryID
WHERE l.type = 'user'
```

**Why INNER JOIN not LEFT JOIN:**
- deletedItems.itemID ALWAYS has corresponding items.itemID (referential integrity)
- We want to count only trash from personal library, filter is required
- INNER JOIN is more performant and semantically correct

**Consistency with codebase:**
- Follows same pattern as LIBRARY_STATS_QUERY (line 352: `LEFT JOIN deletedItems di ON i.itemID = di.itemID`)
- Uses INNER JOIN for libraries like ITEMS_QUERY (line 70: `INNER JOIN libraries l ON i.libraryID = l.libraryID`)
- Applies same library filter (l.type = 'user') as all other queries
  </action>
  <verify>
Query must not reference `deletedItems.libraryID` directly.
Must use JOIN to items table, then JOIN to libraries table.
Must filter on `l.type = 'user'`.
  </verify>
  <done>TRASH_COUNT_QUERY uses JOIN pattern and will not throw "no such column: libraryID" error</done>
</task>

<task type="auto">
  <name>Fix DUPLICATES_QUERY to return correct duplicate count</name>
  <files>src/db/queries.ts</files>
  <action>
The current DUPLICATES_QUERY architecture has a fundamental counting issue:

1. Self-join with `i1.itemID < i2.itemID` creates pairs (A,B), (A,C), (B,C)
2. Each pair generates rows for both items in duplicate_groups CTE
3. `COUNT(*) OVER (PARTITION BY match_basis)` counts total rows per group
4. Service counts `duplicates.length` which is the number of rows

**The fix:** Return DISTINCT items only, not all pairs.

Replace the final SELECT (lines 292-300) with:

```sql
SELECT DISTINCT
  itemID,
  itemKey,
  itemType,
  title,
  (SELECT COUNT(DISTINCT i2.itemID) + 1
   FROM normalized_items i2
   WHERE i2.itemID != duplicate_groups.itemID
     AND (
       (duplicate_groups.match_basis LIKE 'doi:%' AND i2.doi = SUBSTR(duplicate_groups.match_basis, 5))
       OR (duplicate_groups.match_basis LIKE 'isbn:%' AND i2.isbn = SUBSTR(duplicate_groups.match_basis, 6))
       OR (duplicate_groups.match_basis LIKE 'title:%' AND i2.normalized_title = SUBSTR(duplicate_groups.match_basis, 7))
     )
  ) AS duplicate_count
FROM duplicate_groups
WHERE match_basis IS NOT NULL
ORDER BY match_basis, itemID
```

**Why this works:**
- DISTINCT eliminates duplicate rows from self-join pairs
- Subquery counts all items in same match_basis group (excluding self, hence +1)
- Each item appears exactly once in results
- duplicate_count shows total items in that group (e.g., 3 means 3 total duplicates including this one)
- Service's `duplicates.length` now correctly counts unique duplicate items

**Alternative simpler approach (preferred):**

Since the service only uses `duplicates.length` to count total duplicates, we can simplify:

1. Change duplicate_groups CTE to select UNION of both sides of the pair
2. Use DISTINCT in final SELECT to deduplicate

Replace lines 266-300 with:

```sql
duplicate_groups AS (
  SELECT
    i1.itemID,
    i1.itemKey,
    i1.itemType,
    i1.title,
    CASE
      WHEN i1.doi IS NOT NULL AND i1.doi = i2.doi THEN 'doi:' || i1.doi
      WHEN i1.itemType IN ('book', 'bookSection') AND i1.isbn IS NOT NULL AND i1.isbn = i2.isbn
           THEN 'isbn:' || i1.isbn
      WHEN i1.normalized_title IS NOT NULL AND i1.normalized_title = i2.normalized_title
           AND i1.normalized_title != '' THEN 'title:' || i1.normalized_title
      ELSE NULL
    END AS match_basis
  FROM normalized_items i1
  JOIN normalized_items i2
    ON i1.itemID != i2.itemID
    AND (
      (i1.doi IS NOT NULL AND i1.doi = i2.doi)
      OR (i1.itemType IN ('book', 'bookSection') AND i1.isbn IS NOT NULL AND i1.isbn = i2.isbn)
      OR (i1.normalized_title IS NOT NULL AND i1.normalized_title = i2.normalized_title AND i1.normalized_title != '')
    )
)
SELECT
  itemID,
  itemKey,
  itemType,
  title,
  COUNT(*) OVER (PARTITION BY match_basis) AS duplicate_count
FROM duplicate_groups
WHERE match_basis IS NOT NULL
GROUP BY itemID, itemKey, itemType, title, match_basis
ORDER BY match_basis, itemID
```

**Key change:** `i1.itemID < i2.itemID` → `i1.itemID != i2.itemID` with GROUP BY to deduplicate.

This ensures each item appears once, and duplicate_count accurately reflects group size.

**IMPORTANT:** Test both approaches. If simple approach still has issues, use the subquery approach.
  </action>
  <verify>
After changes:
1. Run plugin with user's database (0 duplicates expected)
2. Preflight check should show 0 duplicates, not 13,399
3. Test with known duplicates (create 2 items with same DOI) - should show 2 duplicates
  </verify>
  <done>DUPLICATES_QUERY returns accurate count matching actual duplicates in Zotero library</done>
</task>

<task type="auto">
  <name>Update query documentation to reflect fixes</name>
  <files>src/db/queries.ts</files>
  <action>
Update JSDoc comments for both queries:

**TRASH_COUNT_QUERY (line 303-308):**
```typescript
/**
 * Query to count items in trash (deletedItems table).
 * Used for preflight health check.
 *
 * Architecture:
 * - JOINs items table to access libraryID (deletedItems has no libraryID column)
 * - Filters to personal library only (type='user')
 * - Uses INNER JOIN pattern for performance (deletedItems always has corresponding items row)
 *
 * Returns count for personal library trash items.
 */
```

**DUPLICATES_QUERY (line 222-238):**
Add note about counting logic:
```
 * Architecture:
 * - Uses self-join on normalized_items CTE to find matching pairs
 * - Changed from i1.itemID < i2.itemID to i1.itemID != i2.itemID with GROUP BY to avoid double-counting
 * - Each item appears once in results (not once per pair)
 * - duplicate_count shows total items in that group
```
  </action>
  <verify>
Documentation accurately describes the JOIN pattern and counting logic.
Comments explain WHY not just WHAT.
  </verify>
  <done>Query documentation updated with architectural context</done>
</task>

</tasks>

<verification>
1. No TypeScript compilation errors
2. TRASH_COUNT_QUERY does not reference deletedItems.libraryID directly
3. DUPLICATES_QUERY uses GROUP BY or DISTINCT to prevent double-counting
4. Both queries maintain consistency with existing library filtering patterns
</verification>

<success_criteria>
- TRASH_COUNT_QUERY executes without "no such column: libraryID" error
- DUPLICATES_QUERY returns accurate count (0 when no duplicates, N when N duplicates exist)
- Preflight check completes successfully
- Documentation reflects architectural decisions
</success_criteria>

<output>
After completion, create `.planning/quick/009-fix-preflight-check-errors-sql-libraryid/009-SUMMARY.md`
</output>
